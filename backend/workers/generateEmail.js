import { prisma } from "../lib/prisma.js";
import { generateDraft as realGenerateDraft } from "../services/emailGen.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "generate-email";

const DEFAULT_PROFILE = {
  senderName: "Outreach Team",
  senderCompany: "NST",
  valueProp: "NST students build production-grade systems and are job-ready"
};

let generateDraft = realGenerateDraft;
export function __setGenerateDraft(fn) { generateDraft = fn; }

export async function runGenerateEmailJob(job) {
  const { leadId, autoDispatch = false } = job.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`lead ${leadId} not found`);

  const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
  const draft = await generateDraft(lead, DEFAULT_PROFILE, { brandDoc: brandDoc?.content ?? null });
  const latest = await prisma.email.findFirst({ where: { leadId }, orderBy: { version: "desc" } });
  const version = latest ? latest.version + 1 : 1;

  const email = await prisma.email.create({
    data: { leadId, subject: draft.subject, body: draft.body, version, status: "DRAFT" }
  });
  logger.info(`generated email v${version} for lead ${leadId}`);

  if (autoDispatch) {
    const pendingLeads = await prisma.lead.count({
      where: {
        campaignId: lead.campaignId,
        email: { not: null },
        emails: { none: {} }
      }
    });
    if (pendingLeads === 0) {
      await prisma.campaign.update({
        where: { id: lead.campaignId },
        data: { status: "AWAITING_EMAIL_APPROVAL" }
      });
      logger.info(`campaign ${lead.campaignId} awaiting email approval`);
    }
  }

  return { emailId: email.id, version };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runGenerateEmailJob);
}
