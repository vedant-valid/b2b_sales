import { prisma } from "../lib/prisma.js";
import { searchLeads as realSearchLeads } from "../services/lusha.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "fetch-leads";

let lusha = { searchLeads: realSearchLeads };
export function __setLushaImpl(impl) { lusha = impl; }

export async function runFetchLeadsJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  // searchLeads now returns fully enriched leads (email included)
  const results = await lusha.searchLeads(campaign.extractedFilters);
  logger.info(`fetch-leads: ${results.length} enriched leads for campaign ${campaignId}`);

  if (results.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return { leadCount: 0 };
  }

  for (const r of results) {
    await prisma.lead.upsert({
      where: { lushaPersonId: r.lushaContactId || `${campaignId}-${r.email}` },
      update: {},
      create: {
        lushaPersonId: r.lushaContactId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        title: r.title,
        company: r.company,
        location: r.location,
        linkedinUrl: r.linkedinUrl,
        department: r.department,
        seniority: r.seniority,
        campaignId
      }
    });
  }

  const leads = await prisma.lead.findMany({ where: { campaignId, email: { not: null } } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "AWAITING_LEAD_APPROVAL" } });
  logger.info(`fetch-leads: campaign ${campaignId} awaiting lead approval (${leads.length} leads)`);
  return { leadCount: leads.length };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runFetchLeadsJob);
}
