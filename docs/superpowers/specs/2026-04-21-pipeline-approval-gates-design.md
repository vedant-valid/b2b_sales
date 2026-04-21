# Pipeline Approval Gates Design

**Date:** 2026-04-21
**Status:** Approved

## Problem

The campaign pipeline currently auto-chains end-to-end:
`fetch-leads` → `generate-email` (per lead) → `dispatch-to-instantly`

No human review happens between steps. This is risky — bad leads flow straight into email generation, and generated emails go straight to Instantly without the user seeing them first.

## Solution

Two yes/no approval gates added to the pipeline. On **Yes** the pipeline continues; on **No** all campaign data is deleted and the campaign resets to DRAFT.

---

## Gate 1 — Lead Review

**Trigger:** `fetchLeads.js` finishes upserting leads from Lusha.

**Before:** Auto-enqueues `generate-email` for every lead.

**After:** Sets campaign status → `AWAITING_LEAD_APPROVAL`. Does NOT enqueue anything.

**User sees:** Campaign detail page shows the fetched lead list with two buttons: **Approve** and **Reject**.

**Approve:** `POST /api/campaigns/:id/approve-leads`
- Enqueues `generate-email` for all leads in the campaign
- Sets status → `RUNNING`

**Reject:** `POST /api/campaigns/:id/reject-leads`
- Deletes all `Lead` rows for this campaign
- Sets status → `DRAFT`

---

## Gate 2 — Email Review

**Trigger:** `generateEmail.js` finishes generating drafts for all leads.

**Before:** Auto-enqueues `dispatch-to-instantly`.

**After:** Sets campaign status → `AWAITING_EMAIL_APPROVAL`. Does NOT enqueue dispatch.

**User sees:** Campaign detail page shows all email drafts (via existing EmailDraftPanel) with two buttons: **Approve & Launch** and **Reject**.

**Approve:** `POST /api/campaigns/:id/approve-emails`
- Enqueues `dispatch-to-instantly`
- Sets status → `RUNNING`

**Reject:** `POST /api/campaigns/:id/reject-emails`
- Deletes all `Email` and `Lead` rows for this campaign
- Sets status → `DRAFT`

---

## Schema Changes

Add two values to `CampaignStatus` enum in `schema.prisma`:

```prisma
enum CampaignStatus {
  DRAFT
  RUNNING
  AWAITING_LEAD_APPROVAL   // new
  AWAITING_EMAIL_APPROVAL  // new
  PAUSED
  COMPLETED
}
```

Requires a Prisma migration (`prisma migrate dev`).

---

## Frontend Changes

`frontend/src/app/(app)/campaigns/[id]/page.jsx` — add a status-driven approval banner:

- When status is `AWAITING_LEAD_APPROVAL`: show lead count summary + **Approve** / **Reject** buttons above the lead table
- When status is `AWAITING_EMAIL_APPROVAL`: show email count summary + **Approve & Launch** / **Reject** buttons above the EmailDraftPanel
- Both buttons call their respective backend routes and refresh campaign state on response

---

## What Does NOT Change

- Campaign creation flow (unchanged)
- The `run` route that triggers `fetch-leads` (unchanged)
- `dispatch-to-instantly` worker (unchanged)
- Manual email regeneration flow (unchanged — `autoDispatch: false` path)
- Lead table and EmailDraftPanel components (reused as-is, buttons added above)
