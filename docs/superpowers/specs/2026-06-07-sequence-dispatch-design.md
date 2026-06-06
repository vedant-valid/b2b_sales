---
title: Sequence Dispatch — Wire Approved Steps to Instantly
date: 2026-06-07
status: approved
---

## Problem

`SequenceStep` rows and the `sequenceApproved` flag are stored in the DB but never read during dispatch. `instantly.js createCampaign()` always sends a hardcoded single-step sequence. "Sequence approved ✓" is UI-only theatre.

## Goal

When a campaign has an approved sequence, dispatch all steps to Instantly so leads automatically receive follow-up emails on the configured schedule.

## Design

### Scope

Two files change: `backend/services/instantly.js` and `backend/workers/dispatchCampaign.js`. All other files (sequence route, generateEmail worker, templateEngine, frontend) are untouched.

### Personalization strategy

Step 1 (the intro email) uses full per-lead personalization via the existing mechanism: the campaign step body is `{{personalization}}`, and the rendered email draft body is pushed per-lead as `personalization`. This is unchanged.

Steps 2+ are shared templates — Instantly substitutes native lead variables. This matches the user's intended workflow: follow-up emails are lighter-touch templates where only name/company vary, with fuller brand/copy docs coming later.

### Variable mapping

Applied to step 2+ bodies before sending to Instantly:

| Our token | Instantly native | Action |
|---|---|---|
| `{{firstName}}` | `{{firstName}}` | pass through |
| `{{lastName}}` | `{{lastName}}` | pass through |
| `{{title}}` | `{{title}}` | pass through |
| `{{company}}` | `{{companyName}}` | rename |
| `{{aiPersonalization}}` | *(none)* | strip |

Mapping applied in `instantly.js` in a single `mapSequenceBody()` helper so it's one place to update when the brand-doc templates arrive.

### `instantly.js` — `createCampaign()` change

Signature gains an optional `sequenceSteps` parameter:

```js
export async function createCampaign(name, opts = {})
// opts gains: sequenceSteps?: Array<{ stepNumber, subject, body, delayDays }>
```

**If `sequenceSteps` is provided and non-empty:**
- Build `sequences[0].steps[]` from the array ordered by `stepNumber`
- Step 1: `delay: 0`, `delay_unit: "minutes"`, `body: "{{personalization}}"`, subject from step 1
- Steps 2+: `delay: step.delayDays`, `delay_unit: "days"`, body = `mapSequenceBody(step.body)`, subject from step

**If `sequenceSteps` is absent or empty:**
- Fall back to the existing hardcoded single step — no behaviour change

### `dispatchCampaign.js` — `runDispatchJob()` change

Before calling `createCampaign()`, fetch sequence steps if approved:

```js
let sequenceSteps;
if (campaign.sequenceApproved) {
  sequenceSteps = await prisma.sequenceStep.findMany({
    where: { campaignId },
    orderBy: { stepNumber: "asc" }
  });
}
// pass sequenceSteps into createCampaign opts
```

If `sequenceApproved` is false or no steps exist, `sequenceSteps` is undefined → silent fallback.

### Fallback behaviour

| Condition | Result |
|---|---|
| `sequenceApproved: true`, steps exist | Multi-step Instantly campaign |
| `sequenceApproved: false` | Single-step fallback (current behaviour) |
| `sequenceApproved: true`, no steps | Single-step fallback |

## What is not changing

- Sequence generation, revision, approval routes (`routes/sequence.js`)
- Email generation worker (`workers/generateEmail.js`)
- Template rendering (`services/templateEngine.js`)
- Frontend — no new UI needed
- TEST mode campaigns — still use the demo email template regardless

## Future compatibility

When the brand/follow-up doc templates arrive, the `mapSequenceBody()` helper is the single extension point. The sequence step bodies will simply reference `{{firstName}}`, `{{company}}` etc. and Instantly substitutes them — exactly the same flow.
