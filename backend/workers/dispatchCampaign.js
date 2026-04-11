import { prisma } from "../lib/prisma.js";
import { createCampaign as realCreate, pushLeads as realPush } from "../services/instantly.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "dispatch-to-instantly";

let instantly = { createCampaign: realCreate, pushLeads: realPush };
export function __setInstantlyImpl(impl) { instantly = impl; }

export async function runDispatchJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  let instantlyCampaignId = campaign.instantlyCampaignId;
  if (!instantlyCampaignId) {
    const out = await instantly.createCampaign(campaign.name);
    instantlyCampaignId = out.instantlyCampaignId;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { instantlyCampaignId, status: "RUNNING" }
    });
  }

  // Pull latest-version draft email per lead
  const leads = await prisma.lead.findMany({
    where: { campaignId, email: { not: null } },
    include: { emails: { orderBy: { version: "desc" }, take: 1 } }
  });

  const payload = leads
    .filter((l) => l.emails.length > 0 && l.emails[0].status === "DRAFT")
    .map((l) => ({
      email: l.email,
      firstName: l.firstName,
      lastName: l.lastName,
      company: l.company,
      subject: l.emails[0].subject,
      body: l.emails[0].body,
      _leadId: l.id,
      _emailId: l.emails[0].id
    }));

  if (payload.length === 0) {
    logger.warn(`dispatch: no draft emails for campaign ${campaignId}`);
    return { accepted: 0, rejected: 0 };
  }

  const result = await instantly.pushLeads(instantlyCampaignId, payload);
  const rejectedEmails = new Set((result.rejected || []).map((r) => r.email));

  for (const p of payload) {
    if (rejectedEmails.has(p.email)) {
      await prisma.email.update({ where: { id: p._emailId }, data: { status: "FAILED" } });
    } else {
      await prisma.email.update({
        where: { id: p._emailId },
        data: { status: "SENT", sentAt: new Date() }
      });
      await prisma.lead.update({ where: { id: p._leadId }, data: { status: "CONTACTED" } });
    }
  }
  logger.info(`dispatch: campaign=${campaignId} accepted=${result.accepted} rejected=${(result.rejected || []).length}`);
  return { accepted: result.accepted, rejected: (result.rejected || []).length };
}

export async function register(boss) {
  await boss.work(QUEUE, runDispatchJob);
}
