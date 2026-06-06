# Unibox — Design Spec

**Date:** 2026-06-07
**Status:** Approved

## Overview

A dedicated `/unibox` page that shows full email conversation threads per lead — outbound emails and inbound replies interleaved chronologically — with a reply composer for sending follow-ups via Instantly. Mirrors the core UX of Instantly's Unibox inside the app.

## Layout

Two-panel layout at `/unibox`, added to the sidebar nav between Leads and Replies.

- **Left panel** — scrollable lead list with filter chips at the top
- **Right panel** — chronological thread view for the selected lead, with reply composer at the bottom

## Left Panel

Fetches `GET /api/leads?hasSentEmail=true` on mount. Filter chips (All / Replied / Interested / Convertible) filter the list client-side by `lead.status`. Each row shows: lead name, status badge, last message preview, and date.

## Right Panel — Thread

On lead selection, fetches `GET /api/leads/:id/thread`. Renders messages as chat bubbles:

- **Outbound** (emails we sent) — right-aligned, dark background
- **Inbound** (replies from the lead) — left-aligned, gray background, with sentiment badge

Empty state when no lead is selected: "Select a lead to view their conversation."

## Reply Composer

Textarea + "Send via Instantly" button at the bottom of the right panel. Disabled with a tooltip when the lead's campaign has no `instantlyCampaignId` yet. On submit, calls `POST /api/leads/:id/reply`, then re-fetches the thread to show the new outbound message.

## Backend

### `GET /api/leads/:id/thread`

Fetches the lead's `Email` records (status `SENT`) and `Reply` records, merges and sorts by timestamp, returns a unified `messages` array:

```json
{
  "messages": [
    { "id": "...", "direction": "outbound", "subject": "...", "body": "...", "timestamp": "..." },
    { "id": "...", "direction": "inbound",  "body": "...", "timestamp": "...", "sentiment": "INTERESTED" }
  ]
}
```

### `POST /api/leads/:id/reply` (MANAGER / ADMIN)

Body: `{ "body": "..." }`

1. Looks up lead and its `campaign.instantlyCampaignId`
2. Returns 409 if campaign not dispatched
3. Returns 422 if lead has no email address
4. Calls `instantly.sendSubsequence(campaignId, lead.email, body)`
5. Creates a new `Email` record (`status: SENT`, `sentAt: now()`) so the follow-up appears in the thread immediately
6. Returns `{ ok: true }`

### `GET /api/leads` — new query param

`hasSentEmail=true` adds `where: { emails: { some: { status: 'SENT' } } }` to scope the left panel to leads that have at least one sent email.

## Frontend Files

| File | Purpose |
|------|---------|
| `src/app/(app)/unibox/page.jsx` | Page shell — fetches lead list, owns selected lead state |
| `src/components/unibox/LeadList.jsx` | Left panel: filter chips + lead rows |
| `src/components/unibox/ThreadPanel.jsx` | Right panel: thread bubbles + reply composer |
| `src/app/(app)/layout.jsx` | Add Unibox nav link |

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Campaign not dispatched (`instantlyCampaignId` null) | 409 from backend → composer shows "Campaign not yet sent to Instantly" |
| Lead has no email address | 422 → composer shows error |
| Instantly API failure | Error shown inline; draft not cleared so user can retry |
| No leads with sent emails | Left panel empty state: "No emails sent yet. Run a campaign first." |

## Testing

**Backend (Jest):**
- Thread endpoint returns emails + replies merged in chronological order
- Reply endpoint creates an `Email` record and calls `sendSubsequence`
- 409 when `instantlyCampaignId` is null
- Uses `__setInstantlyImpl` injection (same pattern as existing routes)

**Frontend (Vitest):**
- `LeadList` renders filter chips and filters correctly by status
- `ThreadPanel` renders outbound/inbound bubbles with correct alignment
- Reply composer is disabled when `instantlyCampaignId` is absent
