import { generateJson } from "./gemini.js";

export async function scoreLeads(rawGoal, leads, { generate = generateJson } = {}) {
  const summaries = leads.map(l => ({
    leadId: l.id,
    name: `${l.firstName} ${l.lastName}`,
    title: l.title ?? "Unknown",
    company: l.company ?? "Unknown",
    location: l.location ?? "Unknown",
    seniority: l.seniority ?? "Unknown"
  }));

  const prompt = `Campaign goal: ${rawGoal}

Score each lead 0-100 for fit against this goal.

IMPORTANT: These leads were already pre-filtered by the campaign's search criteria (location, company size, seniority). Fields showing "Unknown" mean the data wasn't returned by the search API — NOT that the lead fails those criteria. Do NOT penalise "Unknown" fields. Treat them as neutral.

Focus your scoring on the data that IS available: job title alignment and company name/profile. Reserve low scores (below 50) only for leads whose known data clearly mismatches the goal.

Return a JSON array only — no prose:
[{ "leadId": "...", "score": 85, "bullets": ["...", "...", "..."] }]

Each bullets array must contain 3-4 items covering:
1. Job title alignment with the target role
2. Company profile match (based on name/industry if available)
3. Any signals about seniority or decision-making authority
4. One gap or concern based only on known data (or "No significant gaps" if none)

Leads:
${JSON.stringify(summaries)}`;

  try {
    const results = await generate(prompt);
    if (!Array.isArray(results)) return [];
    return results.filter(
      r => r.leadId && typeof r.score === "number" && Array.isArray(r.bullets)
    );
  } catch {
    return [];
  }
}
