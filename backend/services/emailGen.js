import { generateJson } from "./gemini.js";
import { formatBrandGuidelines } from "./brandDoc.js";

const SYSTEM = `You are a world-class outbound copywriter. Draft a short, personalized B2B email.

Structure:
- Hook: reference something plausible about the company (do NOT fabricate specific news — use role/industry context)
- Bridge: tie into the sender's value proposition
- Proof: 1 concrete credibility line
- CTA: one clear ask (15-min call)

Rules:
- Subject under 60 chars
- Body under 150 words
- Plain text, no markdown
- No em-dashes

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

const TEMPLATE_SYSTEM = `You are a world-class outbound copywriter. Write a cold outreach B2B email template.

Use these exact placeholder tokens wherever lead-specific values belong:
- {{firstName}} — lead's first name
- {{lastName}} — lead's last name
- {{title}} — lead's job title
- {{company}} — lead's company name
- {{aiPersonalization}} — AI-generated hook line specific to the lead (use once in the opening if it helps)

Structure:
- Hook: use {{aiPersonalization}} or reference {{title}} / {{company}} plausibly
- Bridge: tie into the value proposition from the campaign goal
- Proof: 1 concrete credibility line
- CTA: one clear ask (15-min call)

Rules:
- Subject under 60 chars
- Body under 150 words
- Plain text, no markdown
- No em-dashes
- Use only the placeholder tokens listed above — no hardcoded names or companies

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
  const brandSection = brandText ? `\n\n${brandText}` : "";
  const prompt = `${SEQUENCE_SYSTEM}\n\nCampaign goal: ${rawGoal}${brandSection}\n\nJSON array:`;
  return generate(prompt, opts);
}

const REVISE_SYSTEM = `You are a world-class outbound copywriter. Revise an email sequence based on user feedback.

Return ONLY the full revised sequence as a JSON array in the same format. Keep unchanged steps exactly as-is.`;

export async function reviseSequence(currentSteps, userPrompt, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const brandSection = brandText ? `\n\n${brandText}` : "";
  const prompt = `${REVISE_SYSTEM}${brandSection}

Current sequence:
${JSON.stringify(currentSteps, null, 2)}

User request: ${userPrompt}

JSON array:`;
  return generate(prompt, opts);
}
