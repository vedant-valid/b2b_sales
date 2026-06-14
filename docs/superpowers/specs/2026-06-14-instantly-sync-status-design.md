# Instantly-Backed Sync Status

**Date:** 2026-06-14
**Status:** Approved

## Problem

The campaign detail page's **Sync Status** button (`POST /api/campaigns/:id/sync-lead-status`) only checks our own database: any `Lead` with `status: NEW` whose latest `Email.status === "SENT"` gets flipped to `CONTACTED`.

But `Email.status = "SENT"` is set the moment `pushLeads` successfully hands the lead to Instantly at dispatch time (`workers/dispatchCampaign.js`) — it means "Instantly accepted this lead into the campaign queue," not "Instantly has actually sent the email." The real confirmation is the `email_sent` webhook (`routes/webhooks.js`), which can be missed in dev or misconfigured environments. The current Sync Status button doesn't reconcile against Instantly at all — it just trusts our own optimistic flag, so it can mark a lead `CONTACTED` before Instantly has sent anything.

## Goal

Make Sync Status query Instantly directly and only mark `NEW → CONTACTED` once Instantly confirms it has actually executed a send step for that lead.

Bounce detection is explicitly **out of scope** for this change (see Out of Scope).

## Approach

### `services/instantly.js`: new export `getLeadSendStatus`

```js
export async function getLeadSendStatus(instantlyCampaignId, email, opts = {}) {
  const devMode = env.DEV_MODE === "true";
  const lookupEmail = devMode ? (env.DEV_EMAIL || "madnevedant15@gmail.com") : email;
  const data = await req("/api/v2/leads/list", "POST", { search: lookupEmail, campaign: instantlyCampaignId, limit: 1 }, opts);
  const lead = data?.items?.[0];
  return { sent: !!lead?.timestamp_last_contact };
}
```

- Same call shape and DEV_MODE email-redirect convention as the existing `lookupInstantlyLeadId`.
- `timestamp_last_contact` is only populated by Instantly once a send step has actually executed for that lead (confirmed against a live campaign — see `status_summary.lastStep.timestamp_executed` / `timestamp_last_contact` in the `/api/v2/leads/list` response).
- Returns `{ sent: false }` if no matching lead is found — **does not throw** on "not found." A real Instantly API error (non-2xx) still throws `HttpError` as `req()` already does.

### `routes/campaigns.js`: DI wiring

Add the standard DI object used elsewhere in this router file (`routes/leads.js`, `routes/replies.js` follow the same pattern):

```js
import { getCampaignAnalytics, getLeadSendStatus as realGetLeadSendStatus } from "../services/instantly.js";

let instantly = { getLeadSendStatus: realGetLeadSendStatus };
export function __setInstantlyImpl(impl) { instantly = impl; }
```

### Rewrite `POST /:id/sync-lead-status`

1. 404 if campaign not found.
2. If `!campaign.instantlyCampaignId` → return `{ updated: 0 }` immediately (nothing dispatched yet, nothing to reconcile).
3. Query candidate leads (same filter as today):
   ```js
   prisma.lead.findMany({
     where: {
       campaignId: campaign.id,
       status: "NEW",
       email: { not: null },
       emails: { some: { status: "SENT" } }
     },
     select: { id: true, email: true }
   })
   ```
4. For each candidate lead, call `instantly.getLeadSendStatus(campaign.instantlyCampaignId, lead.email)`. If `sent === true`, update that lead's `status` to `"CONTACTED"` and increment `updated`.
5. Return `{ updated }` — **unchanged response shape**, so the existing frontend (`onSyncStatus` in `frontend/src/app/(app)/campaigns/[id]/page.jsx`) needs no changes.

### Error handling

- A genuine Instantly API error (bad credentials, 5xx) thrown by `req()` propagates via `next(e)`, surfaced through the existing `setError(e.message)` path in the frontend. Any leads already updated earlier in the loop remain updated (no transaction/rollback — each update is independent and idempotent).
- A lead not found in Instantly's campaign (e.g. still queued, not yet picked up) is treated as "not sent yet" — left as `NEW`, not an error.

## Out of Scope

- **Bounce detection.** Instantly's lead record includes an `esp_code` field that likely signals delivery/bounce problems, but its exact value semantics are unverified. Misclassifying this could wrongly mark good leads `NOT_INTERESTED`. Bounces continue to be handled only by the existing `email_bounced` webhook. A follow-up change can revisit `esp_code` once its meaning is confirmed against a real bounce.
- Reply detection / sentiment sync from Instantly — owned entirely by the `reply_received` webhook → `process-reply` worker, unchanged.
- Engagement stats (opens/clicks) — already surfaced at the campaign level via `getCampaignAnalytics`; not added per-lead.
- Automatic/periodic sync — Sync Status remains a manual, button-triggered action.
- Any UI changes — same button, same label, same response shape.

## Testing

### `tests/services/instantly.test.js`

- `getLeadSendStatus` returns `{ sent: true }` when the matched lead has `timestamp_last_contact` set.
- `getLeadSendStatus` returns `{ sent: false }` when `timestamp_last_contact` is absent, or `items` is empty.
- DEV_MODE: `search` param uses `DEV_EMAIL` instead of the passed-in email (mirrors `lookupInstantlyLeadId`'s existing dev-mode test).

### `tests/routes/campaigns.test.js`

New coverage for `/sync-lead-status` via `__setInstantlyImpl`:

- NEW lead with a `SENT` email, Instantly confirms `sent: true` → lead becomes `CONTACTED`, response `{ updated: 1 }`.
- NEW lead with a `SENT` email, Instantly returns `sent: false` → lead stays `NEW`, response `{ updated: 0 }`.
- Campaign with no `instantlyCampaignId` → `{ updated: 0 }`, `getLeadSendStatus` never called.
- A lead already `CONTACTED` (or with no `SENT` email) is excluded from the candidate query and untouched.
