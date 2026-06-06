import { generateJson } from "./gemini.js";
import { formatBrandGuidelines } from "./brandDoc.js";

const VALID = ["INTERESTED", "NOT_INTERESTED", "NEUTRAL", "CONVERTIBLE"];

const CLASSIFY_PROMPT = `Classify the reply into exactly one of: INTERESTED, NOT_INTERESTED, NEUTRAL, CONVERTIBLE.

Definitions:
- INTERESTED: clear yes, wants a meeting
- NOT_INTERESTED: explicit no, unsubscribe, not relevant
- NEUTRAL: ambiguous, asking questions, deferring
- CONVERTIBLE: not ready now but open in the future or redirects to colleague

Return JSON: { "sentiment": string }`;

export async function classifySentiment(replyBody, { generate = generateJson } = {}) {
  const out = await generate(`${CLASSIFY_PROMPT}\n\nReply:\n${replyBody}\n\nJSON:`);
  return VALID.includes(out.sentiment) ? out.sentiment : "NEUTRAL";
}

const FOLLOWUP_PROMPT = `Draft a brief, warm follow-up email. 60 words or less. Plain text. No em-dashes. No placeholders whatsoever — use the actual names provided. Sign off with the sender name. When proposing meeting times, use IST (Indian Standard Time) and do not mention any other timezone.

Sentiment context guides tone:
- INTERESTED → propose 2 concrete meeting times in IST
- NOT_INTERESTED → polite acknowledgment, leave door open
- NEUTRAL → answer their question and re-propose a call
- CONVERTIBLE → confirm future timing or redirect gracefully

Return JSON: { "followUp": string }`;

export async function draftFollowUp(replyBody, lead, sentiment, { generate = generateJson, brandFields = null, senderName = "Vedant" } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const brandContext = brandText ? `\n\nBrand voice guidelines:\n${brandText}` : "";
  const prompt = `${FOLLOWUP_PROMPT}${brandContext}

Lead name: ${lead.firstName} ${lead.lastName || ""}
Sender name: ${senderName}

Reply from ${lead.firstName}:
${replyBody}

Sentiment: ${sentiment}

JSON:`;
  const out = await generate(prompt);
  return out.followUp;
}
