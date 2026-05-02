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
Return a JSON array only — no prose:
[{ "leadId": "...", "score": 85, "bullets": ["...", "...", "..."] }]

Each bullets array must contain 3-4 items covering:
1. Job title alignment
2. Company profile match
3. Location / market fit
4. One gap or concern (or "No significant gaps" if none)

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
