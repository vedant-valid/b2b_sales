import { prisma } from "../lib/prisma.js";
import { searchLeads as realSearchLeads, enrichContact as realEnrichContact } from "../services/lusha.js";
import { logger } from "../lib/logger.js";
import { getBoss } from "../lib/pgboss.js";

export const QUEUE = "fetch-leads";

let lusha = { searchLeads: realSearchLeads, enrichContact: realEnrichContact };
export function __setLushaImpl(impl) { lusha = impl; }

export async function runFetchLeadsJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  const results = await lusha.searchLeads(campaign.extractedFilters);
  logger.info(`fetch-leads: ${results.length} results for campaign ${campaignId}`);

  if (results.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return { leadCount: 0 };
  }

  for (const r of results) {
    const enriched = await lusha.enrichContact(r.lushaPersonId);
    await prisma.lead.create({
      data: {
        lushaPersonId: r.lushaPersonId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: enriched.email,
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

  // Enqueue email generation for each lead with an email
  const boss = await getBoss();
  const leads = await prisma.lead.findMany({ where: { campaignId, email: { not: null } } });
  for (const lead of leads) {
    await boss.send("generate-email", { leadId: lead.id });
  }
  return { leadCount: leads.length };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runFetchLeadsJob);
}
