import { generateJson } from "./gemini.js";

const SYSTEM_PROMPT = `You are a B2B prospecting assistant. Convert a natural-language outreach goal into structured Lusha Prospecting API filters.

Return JSON only, with this shape:
{
  "filters": {
    "seniorities": [string],
    "departments": [string],
    "locations": [string],
    "companySizes": [string],
    "titleKeywords": [string],
    "excludeTitleKeywords": [string],
    "excludeIndustries": [string]
  },
  "confidence": number (0..1),
  "clarification": string (only if confidence < 0.7)
}

RULES:
- "seniorities": use only exact Lusha values → "founder", "partner", "c-suite", "vice president", "director", "manager", "senior", "entry", "intern", "other"
- "departments": use only exact Lusha values → "Business Development", "Consulting", "Customer Service", "Engineering & Technical", "Finance", "General Management", "Health Care & Medical", "Human Resources", "Information Technology", "Legal", "Marketing", "Operations", "Other", "Product", "Research & Analytics", "Sales"
- "locations": country names only (e.g. "India", "United States")
- "companySizes": use range strings → "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+" OR natural language → "startup", "small", "medium", "large", "enterprise", "unicorn"
- "titleKeywords": ALWAYS include when a specific role is mentioned — used to post-filter results. Use lowercase substrings that appear in target job titles.
- "excludeTitleKeywords": populate when the goal explicitly excludes a role (e.g. "not CISOs", "exclude security heads"). Use lowercase substrings.
- "excludeIndustries": populate when the goal excludes an industry (e.g. "no hospitality", "exclude healthcare"). Use plain English industry names.
- Omit any field you cannot confidently infer from the goal
- Do NOT invent values outside the allowed lists

ROLE → DEPARTMENT MAPPING (ALWAYS apply when role is mentioned):
- CTO / Chief Technology Officer / VP Engineering / Head of Engineering → departments: ["Engineering & Technical"], seniorities: ["c-suite", "vice president", "director"]
- CMO / Chief Marketing Officer / VP Marketing → departments: ["Marketing"], seniorities: ["c-suite", "vice president"]
- CFO / Chief Financial Officer / VP Finance → departments: ["Finance"], seniorities: ["c-suite", "vice president"]
- CPO / Chief Product Officer / VP Product / Head of Product → departments: ["Product"], seniorities: ["c-suite", "vice president", "director"]
- CRO / VP Sales / Head of Sales → departments: ["Sales"], seniorities: ["c-suite", "vice president", "director"]
- CEO / Founder / Co-Founder → departments: [], seniorities: ["founder", "c-suite"]
- HR Director / Head of HR / CHRO → departments: ["Human Resources"], seniorities: ["c-suite", "director"]
- CISO / Head of Security → departments: ["Engineering & Technical", "Information Technology"], seniorities: ["c-suite", "director"]

TITLE KEYWORD EXAMPLES:
- "CTOs" → titleKeywords: ["cto", "chief technology", "chief technical", "vp engineering", "vp of engineering", "head of engineering"]
- "CMOs" → titleKeywords: ["cmo", "chief marketing", "vp marketing"]
- "Founders" → titleKeywords: ["founder", "co-founder"]
- "HR Directors" → titleKeywords: ["hr director", "head of hr", "chief people", "chro"]

EXCLUDE EXAMPLES:
- "not CISOs" → excludeTitleKeywords: ["ciso", "chief information security", "head of security"]
- "exclude hospitality companies" → excludeIndustries: ["Hospitality", "Hotels & Resorts"]
- "no healthcare" → excludeIndustries: ["Healthcare", "Hospitals & Health Care"]`;


export async function extractFilters(rawGoal, { generate = generateJson, brandDoc = null } = {}) {
  const brandContext = brandDoc
    ? `\n\nBrand context (use this to fill gaps not covered by the goal):\n${brandDoc}`
    : "";
  const prompt = `${SYSTEM_PROMPT}\n\nGoal:\n${rawGoal}${brandContext}\n\nJSON:`;
  const result = await generate(prompt);
  if ((result.confidence ?? 0) < 0.7) {
    return { ...result, needsClarification: true, clarification: result.clarification || "Please add more detail." };
  }
  return { ...result, needsClarification: false };
}
