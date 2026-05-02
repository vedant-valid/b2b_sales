# Lead Scoring & HITL Approval Gate — Design Spec

**Date:** 2026-05-02
**Status:** Approved
**Phase:** A of the production-grade outreach architecture upgrade

---

## 1. Overview

Add an AI-powered fit score and per-lead approve/skip gate to the existing `AWAITING_LEAD_APPROVAL` stage. When a batch of leads arrives from Lusha, Gemini scores each one against the campaign goal and returns bullet-point reasoning. The user reviews scores in the campaign detail UI, approves or skips individual leads, then confirms — only approved leads proceed to email generation.

---

## 2. Goals

- Surface lead quality before credits are spent on email generation
- Give operators granular per-lead control (approve / skip / undo)
- Keep infrastructure flat — no new workers or queues
- Single batched Gemini call per campaign (not one per lead) to control cost

---

## 3. Schema Changes

Two nullable fields added to the `Lead` model in `prisma/schema.prisma`:

```prisma
fitScore     Int?   // 0–100 AI fit score
fitReasoning Json?  // String[] — bullet points (title match, company match, location match, gap/concern)
```

No new tables. No new enums. Existing `SKIPPED` LeadStatus covers rejected leads. Approved leads stay `NEW` until an email is sent.

---

## 4. Backend Changes

### 4.1 `workers/fetchLeads.js`

After all leads are upserted, one new scoring step runs:

1. Build a compact lead summary array: `[{ leadId, firstName, lastName, title, company, location, seniority }]`
2. Single Gemini call with the campaign's `rawGoal` + all lead summaries. Prompt instructs Gemini to return a JSON array: `[{ leadId, score, bullets }]` where `bullets` is a `String[]` of 3–4 points covering title match, company match, location match, and any gap or concern.
3. `prisma.$transaction` — bulk-update each lead row with its `fitScore` and `fitReasoning`.

Scoring completes before the campaign status is set to `AWAITING_LEAD_APPROVAL`, so scores are always present when the approval UI loads.

### 4.2 `routes/campaigns.js` — `POST /:id/approve-leads`

Current behaviour: approves all leads and enqueues `generate-email` for all of them.

Updated behaviour:
- Accepts optional body `{ approvedIds: string[] }`
- If `approvedIds` is provided: set `SKIPPED` on every lead in the campaign **not** in the list, then enqueue `generate-email` only for the approved leads
- If `approvedIds` is omitted: existing behaviour preserved (all non-SKIPPED leads proceed) — backwards compatible

### 4.3 `routes/leads.js` — new endpoint

```
PATCH /api/leads/:id/status
Body: { status: "SKIPPED" | "NEW" }
Auth: requireAuth + MANAGER or ADMIN role
```

Allows individual lead status toggling (skip / undo skip) without going through the campaign approval flow. Used by the per-row Approve/Skip buttons in the UI.

---

## 5. Frontend Changes

### 5.1 `LeadTable` component

When the parent campaign is in `AWAITING_LEAD_APPROVAL` status, two new columns appear:

| Column | Detail |
|---|---|
| **Score** | Colour-coded badge — green (≥70), yellow (40–69), red (<40) |
| **Fit Reasoning** | Collapsed by default; chevron expands to show bullet points |

Each row also gains **Approve** and **Skip** buttons:
- **Skip** → calls `PATCH /api/leads/:id/status` with `{ status: "SKIPPED" }`, greys out the row, shows an **Undo** link
- **Approve** (implicit — default state for non-skipped leads) → no API call needed until Confirm

### 5.2 Campaign detail page (`/campaigns/[id]`)

A sticky footer bar appears when status is `AWAITING_LEAD_APPROVAL`:

- Counter: `X of Y leads approved`
- **Approve All** shortcut — marks all leads as non-skipped locally
- **Confirm & Generate Emails** button — disabled until at least 1 lead is approved; on click calls `POST /api/campaigns/:id/approve-leads` with `{ approvedIds: [all non-SKIPPED lead IDs] }`

No new pages required.

---

## 6. Gemini Prompt Contract

**Input to Gemini:**
```
Campaign goal: <rawGoal>

Score each lead 0–100 for fit against this goal.
Return a JSON array only — no prose:
[{ "leadId": "...", "score": 85, "bullets": ["...", "...", "..."] }]

Each bullets array must contain 3–4 items covering:
1. Job title alignment
2. Company profile match
3. Location / market fit
4. One gap or concern (or "No significant gaps" if none)

Leads:
<compact JSON array of lead summaries>
```

**Output:** parsed as JSON; if parsing fails, all leads get `fitScore: null` and `fitReasoning: null` — the approval UI falls back to showing leads without scores, and the operator can still approve/skip manually.

---

## 7. Error Handling

| Failure | Behaviour |
|---|---|
| Gemini call fails or times out | Leads upserted without scores; campaign proceeds to `AWAITING_LEAD_APPROVAL`; UI shows leads without score badges |
| Gemini returns malformed JSON | Same fallback as above |
| `PATCH /api/leads/:id/status` fails | UI shows inline error on that row; no state change |
| `POST /api/campaigns/:id/approve-leads` fails | Toast error; campaign stays at `AWAITING_LEAD_APPROVAL` |

---

## 8. What Is Explicitly Out of Scope

- External signal enrichment (funding news, hiring velocity, job board scraping)
- Auto-skip below a score threshold
- Persistent per-user approval history / audit log
- Multi-tenancy or credit deduction tied to scoring
- A/B testing of score thresholds

These belong to later phases of the architecture upgrade.
