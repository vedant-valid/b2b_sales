import { prisma } from "../lib/prisma.js";
import { searchLeadsBasic as realSearchLeadsBasic } from "../services/lusha.js";
import { scoreLeads as realScoreLeads } from "../services/leadScoring.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "fetch-leads";

let lusha = { searchLeadsBasic: realSearchLeadsBasic };
export function __setLushaImpl(impl) { lusha = impl; }

let scorer = { scoreLeads: realScoreLeads };
export function __setScoringImpl(impl) { scorer = impl; }

export async function runFetchLeadsJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  const rawResults = await lusha.searchLeadsBasic(campaign.extractedFilters);

  // Post-filter by titleKeywords (include) then excludeTitleKeywords (exclude)
  const keywords = campaign.extractedFilters?.titleKeywords;
  const excludeKeywords = campaign.extractedFilters?.excludeTitleKeywords;

  let results = keywords?.length
    ? rawResults.filter(r => {
        const title = (r.title || "").toLowerCase();
        return keywords.some(kw => title.includes(kw.toLowerCase()));
      })
    : rawResults;

  if (excludeKeywords?.length) {
    results = results.filter(r => {
      const title = (r.title || "").toLowerCase();
      return !excludeKeywords.some(kw => title.includes(kw.toLowerCase()));
    });
  }

  logger.info(`fetch-leads: ${rawResults.length} raw → ${results.length} after title filters for campaign ${campaignId}`);

  if (results.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return { leadCount: 0 };
  }

  const upsertedLeads = [];
  for (const r of results) {
    const personId = r.lushaContactId ?? `${campaignId}-unknown-${Date.now()}`;
    const existing = personId
      ? await prisma.lead.findUnique({ where: { lushaPersonId: personId } })
      : null;

    let lead;
    if (!existing) {
      lead = await prisma.lead.create({
        data: {
          lushaPersonId: personId,
          lushaRequestId: r.requestId,
          firstName: r.firstName,
          lastName: r.lastName,
          title: r.title,
          company: r.company,
          enrichmentStatus: "PREVIEW",
          isEnriched: false,
          campaignId
        }
      });
    } else if (existing.isEnriched) {
      // Contact already unlocked (credits spent) in another campaign — skip to avoid disrupting it
      logger.info(`fetch-leads: skipping ${personId} — already enriched in campaign ${existing.campaignId}`);
      continue;
    } else {
      // PREVIEW lead from this or another campaign — reassign to current campaign
      lead = await prisma.lead.update({
        where: { id: existing.id },
        data: {
          campaignId,
          lushaRequestId: r.requestId,
          firstName: r.firstName,
          lastName: r.lastName,
          title: r.title,
          company: r.company
        }
      });
    }
    upsertedLeads.push(lead);
  }

  if (upsertedLeads.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    logger.info(`fetch-leads: all contacts already enriched in other campaigns for campaign ${campaignId}`);
    return { leadCount: 0 };
  }

  let scores = [];
  try {
    scores = await scorer.scoreLeads(campaign.rawGoal, upsertedLeads);
  } catch {
    logger.warn(`fetch-leads: scoring threw for campaign ${campaignId}, continuing without scores`);
  }
  if (scores.length > 0) {
    await prisma.$transaction(
      scores.map(({ leadId, score, bullets }) =>
        prisma.lead.update({
          where: { id: leadId },
          data: { fitScore: score, fitReasoning: bullets }
        })
      )
    );
    logger.info(`fetch-leads: scored ${scores.length} leads for campaign ${campaignId}`);
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "AWAITING_LEAD_SELECTION" } });
  logger.info(`fetch-leads: campaign ${campaignId} awaiting lead selection (${upsertedLeads.length} preview leads)`);
  return { leadCount: upsertedLeads.length };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runFetchLeadsJob);
}
