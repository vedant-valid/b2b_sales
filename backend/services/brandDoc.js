import { prisma } from "../lib/prisma.js";

export async function getBrandDoc() {
  return prisma.brandDoc.findUnique({ where: { id: "singleton" } });
}

export function formatBrandGuidelines(fields) {
  if (!fields) return null;
  const { tone, campaignGoals, targetPersonas, proofPoints, bannedWords } = fields;
  const lines = [];
  if (tone) lines.push(`- Tone: ${tone}`);
  if (campaignGoals) lines.push(`- Campaign goals: ${campaignGoals}`);
  if (targetPersonas) lines.push(`- Target personas: ${targetPersonas}`);
  if (proofPoints) {
    const pts = proofPoints.split("\n").filter(Boolean).map(p => `  • ${p.trim()}`).join("\n");
    lines.push(`- Proof points:\n${pts}`);
  }
  if (bannedWords) lines.push(`- Banned words (never use): ${bannedWords}`);
  if (lines.length === 0) return null;
  return `BRAND GUIDELINES — follow these for every output:\n${lines.join("\n")}`;
}
