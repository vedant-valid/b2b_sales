import { generateJson } from "./gemini.js";
import { formatBrandGuidelines } from "./brandDoc.js";

export const DEFAULT_SENDER_NAME = "Outreach Team";

const SYSTEM = `You are a world-class outbound copywriter. Draft a short, personalized B2B email that
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

Return JSON: { "subject": string, "body": string }`;

export async function generateDraft(lead, profile, { generate = generateJson, brandFields = null } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${SYSTEM}

Lead:
- Name: ${lead.firstName} ${lead.lastName}
- Title: ${lead.title}
- Company: ${lead.company}
- Department: ${lead.department || "unknown"}

Sender profile:
- Name: ${profile.senderName}
- Company: ${profile.senderCompany}
- Value prop: ${profile.valueProp}

JSON:`;
  return generate(prompt, opts);
}

const TEMPLATE_SYSTEM = `You are a world-class outbound copywriter. Write a cold outreach B2B email template
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

Return JSON: { "subject": string, "body": string }`;

export async function generateTemplateEmail(rawGoal, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${TEMPLATE_SYSTEM}

Campaign goal: ${rawGoal}

JSON:`;
  return generate(prompt, opts);
}

const SEQUENCE_SYSTEM = `You are a world-class outbound copywriter. Create a cold B2B email sequence.

Return ONLY a JSON array of 2-4 steps, no preamble or wrapper object:
[
  { "stepNumber": 1, "delayDays": 0, "subject": "...", "body": "..." },
  { "stepNumber": 2, "delayDays": 3, "subject": "...", "body": "..." }
]

Rules:
- 2-4 steps total
- Step 1: delayDays MUST be 0 (sent immediately)
- Subsequent steps: delayDays = days after previous step (3-7 typical)
- Subject ≤ 60 chars
- Body ≤ 150 words each
- Plain text only — no markdown, no em-dashes
- Placeholders: {{firstName}}, {{company}}, {{title}}, {{aiPersonalization}}
- Step 1 = warm intro; step 2 = gentle follow-up; final step = brief close`;

export async function generateSequence(rawGoal, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${SEQUENCE_SYSTEM}\n\nCampaign goal: ${rawGoal}\n\nJSON array:`;
  return generate(prompt, opts);
}

const REVISE_SYSTEM = `You are a world-class outbound copywriter. Revise an email sequence based on user feedback.

Return ONLY the full revised sequence as a JSON array in the same format. Keep unchanged steps exactly as-is.`;

export async function reviseSequence(currentSteps, userPrompt, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${REVISE_SYSTEM}\n\nCurrent sequence:\n${JSON.stringify(currentSteps, null, 2)}\n\nUser request: ${userPrompt}\n\nJSON array:`;
  return generate(prompt, opts);
}
