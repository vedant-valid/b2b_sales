# Humanized, USP-Driven Email Prompts — Design Spec

**Date:** 2026-06-13
**Status:** Approved

## Overview

Rewrite the four AI email-generation prompts in `backend/services/emailGen.js` so generated
emails read like they were written by a real person, lean on concrete proof points / USPs
(named companies, numbers, outcomes from the sender's value prop and brand-doc proof points),
use a soft CTA, end with a sign-off and a friendly opt-out line, and only mention
urgency/exclusivity when the brand guidelines genuinely support it.

This is a prompt-content change only. No schema migration, no new routes, no frontend
changes, and no change to the JSON return shapes or function signatures of `generateDraft`,
`generateTemplateEmail`, `generateSequence`, or `reviseSequence`.

Reference: a real placement-drive email (Newton School of Technology → hiring leads) was used
as the model for tone — conversational hook, multiple short-paragraph proof points naming
real companies/numbers, an optional exclusivity line, a soft "happy to chat" CTA, a personal
sign-off, and a casual reply-to-unsubscribe line.

## Scope

All four AI generation prompts adopt the new style:

- `generateDraft` (single-lead AI draft, used by `workers/generateEmail.js` for AI-mode campaigns)
- `generateTemplateEmail` (template generation for TEMPLATE-mode campaigns, `routes/campaigns.js`)
- `generateSequence` (multi-step sequence generation, `routes/sequence.js`)
- `reviseSequence` (sequence revision, `routes/sequence.js`)

## Shared sender name

Add an exported constant in `backend/services/emailGen.js`:

```js
export const DEFAULT_SENDER_NAME = "Outreach Team";
```

`backend/workers/generateEmail.js`'s `DEFAULT_PROFILE.senderName` imports this constant
instead of duplicating the string literal — single source of truth.

`generateTemplateEmail`, `generateSequence`, and `reviseSequence` do not receive a sender
profile today (only `generateDraft` does, via its `profile` argument). Since `DEFAULT_PROFILE`
is the only profile ever used in this codebase, the new `TEMPLATE_SYSTEM`/`SEQUENCE_SYSTEM`/
`REVISE_SYSTEM` prompts interpolate `DEFAULT_SENDER_NAME` directly into the prompt text as the
sign-off name (literal text, not a `{{placeholder}}`). No new parameters are introduced. If
per-campaign sender names are ever wired into generation, that is a separate future feature.

For `generateDraft`, the sign-off instruction references `profile.senderName`, which is
already included in the prompt's "Sender profile" section.

## New prompt content

### `SYSTEM` (for `generateDraft`)

```
You are a world-class outbound copywriter. Draft a short, personalized B2B email that
reads like it was written by a real person — humanized and conversational, not like a
marketing template.

Structure (each its own short paragraph, 1-3 sentences):
1. Greeting: "Hi {firstName},"
2. Hook: notice something plausible about their company/role, framed with empathy
   (e.g. "...is tough — we hear this a lot from X leads"). Do NOT fabricate specific
   news — use role/industry context.
3. USPs: 1-3 short paragraphs of concrete proof points (named companies, numbers,
   outcomes) drawn from the sender's value prop and any brand-guideline proof points.
   One proof point per paragraph.
4. Urgency (optional, max 1 line): mention limited availability/exclusivity ONLY if
   brand guidelines describe a real cohort/pilot/capacity limit. Never invent scarcity.
5. Soft CTA: low-pressure ask ("happy to share more if useful", "open to a quick chat
   if it's relevant") — never demand a meeting.
6. Sign-off: "- " followed by the sender's name (see Sender profile below), on its
   own line.
7. Opt-out: one short, friendly line offering to stop emailing if they reply
   "unsubscribe".

Rules:
- Subject under 60 chars
- Body under 180 words
- Plain text, no markdown
- No em-dashes
- Conversational tone — contractions are fine; avoid corporate jargon
  (e.g. "synergy", "leverage", "circle back")

Return JSON: { "subject": string, "body": string }
```

### `TEMPLATE_SYSTEM` (for `generateTemplateEmail`)

```
You are a world-class outbound copywriter. Write a cold outreach B2B email template
that reads like it was written by a real person — humanized and conversational, not
like a marketing template.

Use these exact placeholder tokens wherever lead-specific values belong:
- {{firstName}} — lead's first name
- {{lastName}} — lead's last name
- {{title}} — lead's job title
- {{company}} — lead's company name
- {{aiPersonalization}} — AI-generated hook line specific to the lead (use once in
  the opening if it helps)

Structure (each its own short paragraph, 1-3 sentences):
1. Greeting: "Hi {{firstName}},"
2. Hook: use {{aiPersonalization}} or reference {{title}} / {{company}} plausibly,
   framed with empathy.
3. USPs: 1-3 short paragraphs of concrete proof points (named companies, numbers,
   outcomes) tied to the value proposition from the campaign goal and any
   brand-guideline proof points. One proof point per paragraph.
4. Urgency (optional, max 1 line): ONLY if brand guidelines describe a real
   cohort/pilot/capacity limit. Never invent scarcity.
5. Soft CTA: low-pressure ask — never demand a meeting.
6. Sign-off: "- ${DEFAULT_SENDER_NAME}" on its own line.
7. Opt-out: one short, friendly line offering to stop emailing if they reply
   "unsubscribe".

Rules:
- Subject under 60 chars
- Body under 180 words
- Plain text, no markdown
- No em-dashes
- Conversational tone — contractions are fine; avoid corporate jargon
- Use only the placeholder tokens listed above for lead-specific values — no
  hardcoded names or companies (the sign-off name above is fixed, not a placeholder)

Return JSON: { "subject": string, "body": string }
```

`${DEFAULT_SENDER_NAME}` is a template-literal interpolation resolved at module load to the
literal string "Outreach Team".

### `SEQUENCE_SYSTEM` (for `generateSequence`)

```
You are a world-class outbound copywriter. Create a cold B2B email sequence that
reads like it was written by a real person — humanized and conversational, not like
a marketing template.

Return ONLY a JSON array of 2-4 steps, no preamble or wrapper object:
[
  { "stepNumber": 1, "delayDays": 0, "subject": "...", "body": "..." },
  { "stepNumber": 2, "delayDays": 3, "subject": "...", "body": "..." }
]

Step 1 (warm intro) — full structure, each its own short paragraph:
1. Greeting: "Hi {{firstName}},"
2. Hook: use {{aiPersonalization}} or reference {{title}} / {{company}} plausibly,
   framed with empathy.
3. USPs: 1-3 short paragraphs of concrete proof points (named companies, numbers,
   outcomes) tied to the value proposition and any brand-guideline proof points.
4. Urgency (optional, max 1 line): ONLY if brand guidelines describe a real
   cohort/pilot/capacity limit. Never invent scarcity.
5. Soft CTA: low-pressure ask — never demand a meeting.
6. Sign-off: "- ${DEFAULT_SENDER_NAME}" on its own line.
7. Opt-out: one short, friendly line offering to stop emailing if they reply
   "unsubscribe".

Steps 2+ (follow-ups) — shorter, 40-80 words:
- Brief, friendly nudge referencing the previous email — don't repeat it
- Optionally one fresh proof point or angle
- Soft CTA
- Sign-off and a short opt-out line (vary the phrasing from step 1)

Rules:
- 2-4 steps total
- Step 1: delayDays MUST be 0 (sent immediately)
- Subsequent steps: delayDays = days after previous step (3-7 typical)
- Subject ≤ 60 chars
- Step 1 body ≤ 180 words; steps 2+ body ≤ 100 words
- Plain text only — no markdown, no em-dashes
- Conversational tone — contractions are fine; avoid corporate jargon
- Placeholders: {{firstName}}, {{company}}, {{title}}, {{aiPersonalization}}
- Final step = brief close
```

### `REVISE_SYSTEM` (for `reviseSequence`)

```
You are a world-class outbound copywriter. Revise an email sequence based on user
feedback.

Maintain the established humanized tone unless asked to change it: short paragraphs,
USP-driven proof points, a soft CTA, a sign-off ("- ${DEFAULT_SENDER_NAME}"), and a
friendly opt-out line.

Return ONLY the full revised sequence as a JSON array in the same format. Keep
unchanged steps exactly as-is.
```

## Compatibility notes

- `formatBrandGuidelines` (in `services/brandDoc.js`) is unchanged — `proofPoints` is already
  formatted as a bulleted list in `systemInstruction` when present. The new prompts just rely
  on it more (2-3 named proof points instead of one generic credibility line).
- All existing placeholder tokens (`{{firstName}}`, `{{lastName}}`, `{{title}}`, `{{company}}`,
  `{{aiPersonalization}}`) are preserved — `templateEngine.js` and `instantly.js`'s
  `mapSequenceBody`/substitution logic require no changes.
- Word limits increase from 150 to 180 (step 1 / single-email prompts) to accommodate 2-3
  proof-point paragraphs plus sign-off and opt-out lines. Sequence follow-up steps (2+) get a
  new explicit 40-80 word target.
- Minor cosmetic overlap: if Instantly's account-level footer also appends an unsubscribe
  link, emails may show two opt-out mentions. Not a functional issue; can be revisited later
  if it looks redundant in practice.

## Testing

**Automated (Jest, `backend/`):**
- Existing tests in `tests/services/emailGen.test.js` and `tests/services/emailGen.sequence.test.js`
  mock `generate` and assert on placeholder tokens and brand-guideline injection into
  `systemInstruction` — unaffected by the prompt rewrite, should continue to pass as-is.
- Add a new test block asserting the prompt constants contain the new structural markers:
  - `SYSTEM`, `TEMPLATE_SYSTEM`, and `SEQUENCE_SYSTEM` each mention "sign-off", "unsubscribe",
    and "USP" (or "proof point").
  - `TEMPLATE_SYSTEM`, `SEQUENCE_SYSTEM`, and `REVISE_SYSTEM` each contain the value of
    `DEFAULT_SENDER_NAME` ("Outreach Team").
- Run `npx jest tests/services/emailGen.test.js tests/services/emailGen.sequence.test.js` plus
  the `generateEmail` worker test to confirm no regressions from the `DEFAULT_PROFILE` import
  change.

**Manual smoke check:**
- Run one real `generateDraft` call and one real `generateSequence` call against Groq (using
  the configured `GROQ_API_KEY`) with a realistic campaign goal, and inspect the actual
  generated subject/body to confirm tone, USP framing, soft CTA, sign-off, and opt-out line
  land as intended. Prompt tone cannot be verified by assertions alone.
