import { prisma } from "../lib/prisma.js";
import { generateDraft as realGenerateDraft } from "../services/emailGen.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "generate-email";

// TODO: load from a SenderProfile table (Phase 9) — using constant for now
const DEFAULT_PROFILE = {
  senderName: "Outreach Team",
  senderCompany: "NST",
  valueProp: "NST students build production-grade systems and are job-ready"
};

let generateDraft = realGenerateDraft;
export function __setGenerateDraft(fn) { generateDraft = fn; }

export async function runGenerateEmailJob(job) {
  const { leadId } = job.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`lead ${leadId} not found`);

  const draft = await generateDraft(lead, DEFAULT_PROFILE);
  const latest = await prisma.email.findFirst({ where: { leadId }, orderBy: { version: "desc" } });
  const version = latest ? latest.version + 1 : 1;

  const email = await prisma.email.create({
    data: {
      leadId,
      subject: draft.subject,
      body: draft.body,
      version,
      status: "DRAFT"
    }
  });
  logger.info(`generated email v${version} for lead ${leadId}`);
  return { emailId: email.id, version };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 5, teamConcurrency: 5 }, runGenerateEmailJob);
}
