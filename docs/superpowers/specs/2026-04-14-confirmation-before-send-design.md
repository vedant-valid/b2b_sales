# Confirmation Before Send — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

---

## Problem

Leads are marked `CONTACTED` in the DB even though no emails are actually delivered. Two root causes:

1. `dispatchCampaign` worker marks leads `CONTACTED` the moment the Instantly API accepts the lead payload (HTTP 200), not when an email is actually sent.
2. Instantly campaigns are created with no sequence steps, so even though leads are added via API, Instantly has nothing to send — campaigns sit in "Error" state with 0 activity.

Additionally, there is no human confirmation gate before emails go out, making it impossible to catch bad drafts before they reach real people.

---

## Goal

Fix the broken dispatch flow and add an explicit confirmation step: after all email drafts are generated, pause for human review before anything is sent to Instantly.

---

## State Machine

```
DRAFT → RUNNING (POST /campaigns/:id/run)
RUNNING → AWAITING_CONFIRMATION (all email drafts ready, worker sets status)
AWAITING_CONFIRMATION → RUNNING (POST /campaigns/:id/confirm-send)
RUNNING → COMPLETED (dispatch worker finishes)
RUNNING → PAUSED (manual pause)
```

---

## Data Model

Add `AWAITING_CONFIRMATION` to the `CampaignStatus` enum in `backend/prisma/schema.prisma`:

```prisma
enum CampaignStatus {
  DRAFT
  RUNNING
  AWAITING_CONFIRMATION
  PAUSED
  COMPLETED
}
```

Run `prisma migrate dev`. No existing rows are affected.

---

## Backend Changes

### 1. `backend/workers/generateEmail.js`

Replace the dispatch-enqueue block with an atomic status update:

```js
const updated = await prisma.campaign.updateMany({
  where: { id: lead.campaignId, status: "RUNNING" },
  data: { status: "AWAITING_CONFIRMATION" }
});
if (updated.count > 0) {
  logger.info(`campaign ${lead.campaignId} awaiting confirmation`);
}
```

- `updateMany` with `status: "RUNNING"` guard is atomic — only one concurrent worker wins; the rest are silent no-ops. Fixes the race condition (previously teamSize:5 could enqueue 5 dispatch jobs).
- Removes the incorrect `!campaign.instantlyCampaignId` check.

### 2. `backend/routes/campaigns.js` — new endpoint

`POST /api/campaigns/:id/confirm-send`  
Requires: `requireAuth`, `requireRole("ADMIN", "MANAGER")`

- 404 if campaign not found
- 409 if `status !== "AWAITING_CONFIRMATION"`
- Enqueues `dispatch-to-instantly` with `singletonKey: \`dispatch-${campaignId}\`` to prevent duplicates
- Returns `{ jobId }`

### 3. `backend/services/instantly.js` — add `addSequenceStep()`

```js
export async function addSequenceStep(instantlyCampaignId, opts = {}) {
  await req(`/api/v2/campaigns/${instantlyCampaignId}/sequences`, "POST", {
    steps: [{
      type: "email",
      delay: 0,
      variants: [{
        subject: "{{custom_subject}}",
        body: "{{custom_body}}"
      }]
    }]
  }, opts);
}
```

Per-lead `custom_variables: { custom_subject, custom_body }` already set in `pushLeads` fill the template. This is what was missing — campaigns had no email steps, so Instantly had nothing to send.

Also remove the `|| "test-key"` fallback from `headers()`. A missing API key should fail loudly (401 → leads go to rejected → marked FAILED with a clear trace), not silently use a fake key.

### 4. `backend/workers/dispatchCampaign.js`

Call `addSequenceStep` immediately after `createCampaign`, before `pushLeads`:

```js
const out = await instantly.createCampaign(campaign.name);
await instantly.addSequenceStep(out.instantlyCampaignId);
instantlyCampaignId = out.instantlyCampaignId;
```

Also rename `custom_variables` keys in `pushLeads` to match the template (`custom_subject`, `custom_body`):

```js
custom_variables: { custom_subject: l.subject, custom_body: l.body }
```

---

## Frontend Changes

### 1. Campaign list (`frontend/src/app/(app)/campaigns/page.jsx`)

Render a "Ready to Review" badge next to the campaign name when `status === "AWAITING_CONFIRMATION"`.

### 2. Campaign detail page (`frontend/src/app/(app)/campaigns/[id]/page.jsx`)

When `campaign.status === "AWAITING_CONFIRMATION"`, render an inline review panel:

**Header:** "Review & Confirm Send — X emails ready"

**Body:** Scrollable list of leads. Each card shows:
- Name, company, title
- Generated email subject (bold)
- Email body (plain text, ~5 lines, expandable inline)

**Footer:** "Confirm & Send X emails" button
- Calls `POST /api/campaigns/:id/confirm-send`
- On success: refreshes the page (campaign transitions to RUNNING)
- On error: shows inline error message

Data sourced from existing endpoints:
- `GET /api/leads?campaignId=:id` for the lead list
- `GET /api/leads/:id/emails` for the draft per lead (latest version, status DRAFT)

No new component files. The panel is status-gated and lives inline in the detail page.

---

## What Is Not Changing

- The `fetchLeads` → `generateEmail` pipeline chain is unchanged.
- `CONTACTED` status meaning: leads are still marked `CONTACTED` after `pushLeads` succeeds. This remains "handed off to Instantly", not "email delivered". Delivery confirmation comes from the Instantly webhook (`reply_received`).
- No new API endpoints beyond `confirm-send`.
- No changes to auth, RBAC, or job registration.

---

## Testing

- `generateEmail` worker test: assert campaign status becomes `AWAITING_CONFIRMATION` when last pending lead is processed; assert no `dispatch-to-instantly` job is enqueued.
- `confirm-send` route tests: 409 when status is not `AWAITING_CONFIRMATION`; 403 for VIEWER role; 202 with jobId for MANAGER/ADMIN.
- `dispatchCampaign` worker test: assert `addSequenceStep` is called when campaign has no `instantlyCampaignId`; assert it is not called when campaign already has one.
- `instantly.js` unit test: assert `addSequenceStep` POSTs correct sequence step shape.
