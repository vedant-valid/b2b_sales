---
title: Sequence Builder UI — Card-Based Steps, Delay Units, Reply-in-Thread
date: 2026-06-12
status: approved
---

## Problem

`EmailSequencePanel` (the "Email Sequence" section on the campaign detail page) only supports steps produced by AI generation. There is no way to manually add, delete, or reorder steps. Delay is a single `delayDays` integer always rendered as "+N days after previous step" — there's no way to express "in 2 hours" or "in 30 minutes". Every step always carries an explicit subject, so Instantly starts a new thread per step instead of replying in the same thread.

The user wants the panel to behave closer to Instantly's own Sequences editor (Image 1 in the original request): card-based steps with add/delete/reorder, a delay value + unit picker, and the ability to leave a follow-up's subject blank so it inherits the previous step's subject (reply-in-thread).

## Goal

Redesign `EmailSequencePanel` and its supporting API/schema so users can fully manage sequence steps by hand — add, delete, reorder, set delay in minutes/hours/days, and optionally leave follow-up subjects blank for thread continuity — while keeping the existing AI generate/revise/approve flow intact.

## Design

### Scope

Files touched:
- `backend/prisma/schema.prisma` (+ migration)
- `backend/routes/sequence.js`
- `backend/services/instantly.js`
- `frontend/src/components/EmailSequencePanel.jsx`
- Associated tests: `tests/routes/sequence.test.js`, `tests/services/instantly.test.js`, `tests/services/emailGen.sequence.test.js`

Out of scope (deferred to later phases, not part of this change):
- A/B variants per step (Phase 2)
- Rich text / HTML body editor (Phase 3 — separate design needed)
- Extended subsequence triggers, per-step/per-variant analytics (Phase 4)
- Custom variables, desktop/mobile preview, autosave (Phase 5)

### Data model

Add one column to `SequenceStep`:

```prisma
model SequenceStep {
  id         String   @id @default(cuid())
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  campaignId String
  stepNumber Int
  subject    String
  body       String
  delayDays  Int      @default(0)
  delayUnit  String   @default("days") // "minutes" | "hours" | "days"
  createdAt  DateTime @default(now())

  @@unique([campaignId, stepNumber])
}
```

- `delayDays` keeps its existing name despite now holding a value interpreted via `delayUnit` (e.g. `delayDays: 30, delayUnit: "minutes"` means "30 minutes"). Renaming the column would require a second migration and a broader find/replace for no behavioral benefit — the UI label is what users see, and the UI will say "Send next message in [value] [unit]" regardless of the underlying field name.
- Migration via `npx prisma migrate dev` from `backend/`. Existing rows backfill `delayUnit: "days"` (the column default), preserving current behavior exactly.
- `subject` may now be an empty string. Empty means "use the previous step's subject" (Instantly reply-in-thread behavior).

### Backend — `routes/sequence.js`

`stepSchema` changes:

```js
const stepSchema = z.object({
  stepNumber: z.number().int().positive(),
  subject: z.string().max(60),                          // was .min(1) — now allows ""
  body: z.string().min(1),
  delayDays: z.number().int().min(0),
  delayUnit: z.enum(["minutes", "hours", "days"]).default("days"),
});
```

- Step 1 (`stepNumber === 1`) must still have a non-empty subject — Instantly has no "previous step" to inherit from for the first email. Enforce this with a `.refine()` on the array schema (`saveSchema`): if `steps[0].subject` is empty, reject with `invalid_input`.
- `replaceSteps()` passes `delayUnit` through to `createMany`/`findMany` unchanged otherwise.
- `/sequence/generate` and `/sequence/revise` (AI-driven): the AI continues to return `delayDays` with implicit "days" semantics; `stepSchema` parsing applies the `delayUnit` default of `"days"`, so AI output validates without prompt changes.

### Backend — `services/instantly.js`

`buildSequenceSteps()` changes:

```js
function buildSequenceSteps(sequenceSteps, mode) {
  if (sequenceSteps?.length) {
    return [...sequenceSteps]
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map((step, i) => ({
        type: "email",
        delay: i === 0 ? 0 : step.delayDays,
        delay_unit: i === 0 ? "minutes" : (step.delayUnit || "days"),
        variants: [{
          subject: step.subject,
          body: i === 0 ? "{{personalization}}" : mapSequenceBody(step.body)
        }]
      }));
  }
  // ... existing fallback unchanged
}
```

- Subject is passed through as-is for every step, including empty strings for steps 2+ — Instantly's API treats an empty `variants[].subject` as "inherit the previous step's subject" (confirmed via Instantly help docs on the Sequences editor).
- Step 1's subject is never empty (enforced by the route-level `.refine()`), so no special-casing is needed.
- `mapSequenceBody()` is unchanged.

### Frontend — `EmailSequencePanel.jsx`

Step cards gain controls (each step renders as a card, as today, with these additions):

1. **Add step** — button below the last card. Appends `{ stepNumber: steps.length + 1, subject: "", body: "", delayDays: 3, delayUnit: "days" }`. New steps start in an editable, unsaved state (same `dirty` mechanism that already exists).
2. **Delete step** — trash icon in each card header. Removes the step and renumbers remaining steps' `stepNumber` sequentially (1, 2, 3, ...). Disabled when only one step remains (a sequence needs at least one step — matches `saveSchema.min(1)`).
3. **Reorder** — up/down arrow buttons in each card header. Swaps the step's position with its neighbor and renumbers both steps' `stepNumber`. First step's "up" and last step's "down" are disabled.
4. **Delay control** — for steps 2+, replace the static "+N days after previous step" label with:
   - A number input bound to `delayDays`
   - A `<select>` bound to `delayUnit` with options `minutes` / `hours` / `days`
   - Rendered as: "Send next message in [ 3 ] [ Days ▾ ]"
   - Step 1 keeps its current "Sent immediately" label (no delay controls — step 1 is always `delay: 0`).
5. **Subject placeholder** — for steps 2+, the subject input gets `placeholder="Leave blank to use previous step's subject"`. Step 1's subject input keeps its current required styling (no placeholder change, still required).

All of the above mutate local `steps` state via the existing `updateStep` / new array-mutation helpers, and flow through the existing `dirty` + "Save changes" button — no new save/approve UX. Adding/deleting/reordering steps marks the panel dirty exactly like editing subject/body does today.

### Validation summary

| Rule | Enforced where |
|---|---|
| At least 1 step | `saveSchema.min(1)` (existing) |
| At most 10 steps | `saveSchema.max(10)` (existing) |
| Step 1 subject non-empty | New `.refine()` on `saveSchema` |
| Steps 2+ subject may be empty | `stepSchema.subject` relaxed from `.min(1)` to `.max(60)` |
| `delayUnit` ∈ {minutes, hours, days} | `stepSchema.delayUnit` enum, default `"days"` |

## Testing

- `tests/routes/sequence.test.js`: add cases for — saving a step with `delayUnit: "hours"`/`"minutes"`; saving step 2 with empty subject (accepted); saving step 1 with empty subject (rejected, `invalid_input`); add/delete/reorder via PUT with a renumbered array.
- `tests/services/instantly.test.js`: `buildSequenceSteps` — assert `delay_unit` reflects `step.delayUnit` for steps 2+, and that an empty `step.subject` passes through unchanged to `variants[].subject`.
- `tests/services/emailGen.sequence.test.js`: confirm AI-generated steps (no `delayUnit` in raw output) still validate against `stepSchema` via the default.

## What is not changing

- AI generate/revise/approve flow and its endpoints
- `EmailTemplatePanel` (Step 1 personalization) and `EmailDraftPanel` (per-lead drafts) — unchanged, addressed in a future phase if needed
- `dispatchCampaign.js` — already reads `sequenceSteps` when `sequenceApproved`; no change needed since `buildSequenceSteps` handles the new fields internally
- Plain-text body format (HTML/rich text is Phase 3, separate design)
