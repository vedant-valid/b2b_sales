import { generateJson } from "./gemini.js";

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

export async function generateDraft(lead, profile, { generate = generateJson, brandDoc = null } = {}) {
  const opts = brandDoc ? { systemInstruction: `BRAND GUIDELINES — follow these for every output:\n${brandDoc}` } : {};
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
