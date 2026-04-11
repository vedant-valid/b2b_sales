import { generateJson } from "./gemini.js";

const SYSTEM_PROMPT = `You are a B2B prospecting assistant. Convert a natural-language outreach goal into structured Lusha Prospecting API filters.

Return JSON only, with this shape:
{
  "filters": {
    "titles": [string],
    "seniorities": [string],
    "departments": [string],
    "locations": [string],
    "industries": [string],
    "companySizes": [string],
    "companyStages": [string]
  },
  "confidence": number (0..1),
  "clarification": string (only if confidence < 0.7)
}

Use only fields that are clearly expressed in the goal. Omit unknown fields (do not invent values).`;

export async function extractFilters(rawGoal, { generate = generateJson } = {}) {
  const prompt = `${SYSTEM_PROMPT}\n\nGoal:\n${rawGoal}\n\nJSON:`;
  const result = await generate(prompt);
  if ((result.confidence ?? 0) < 0.7) {
    return { ...result, needsClarification: true, clarification: result.clarification || "Please add more detail." };
  }
  return { ...result, needsClarification: false };
}
