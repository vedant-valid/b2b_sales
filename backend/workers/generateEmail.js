import { prisma } from "../lib/prisma.js";
import { generateDraft as realGenerateDraft } from "../services/emailGen.js";
import { logger } from "../lib/logger.js";
import { getBoss } from "../lib/pgboss.js";

export const QUEUE = "generate-email";

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

  const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
  const draft = await generateDraft(lead, DEFAULT_PROFILE, { brandDoc: brandDoc?.content ?? null });
  const latest = await prisma.email.findFirst({ where: { leadId }, orderBy: { version: "desc" } });
  const version = latest ? latest.version + 1 : 1;

  const email = await prisma.email.create({
    data: { leadId, subject: draft.subject, body: draft.body, version, status: "DRAFT" }
  });
  logger.info(`generated email v${version} for lead ${leadId}`);

  // Check if all leads in this campaign have at least one draft → enqueue dispatch
  const pendingLeads = await prisma.lead.count({
    where: {
      campaignId: lead.campaignId,
      email: { not: null },
      emails: { none: {} }
    }
  });
  if (pendingLeads === 0) {
    const campaign = await prisma.campaign.findUnique({ where: { id: lead.campaignId } });
    if (campaign && !campaign.instantlyCampaignId) {
      const boss = await getBoss();
      await boss.send("dispatch-to-instantly", { campaignId: lead.campaignId });
      logger.info(`enqueued dispatch for campaign ${lead.campaignId}`);
    }
  }

  return { emailId: email.id, version };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 5, teamConcurrency: 5 }, runGenerateEmailJob);
}
