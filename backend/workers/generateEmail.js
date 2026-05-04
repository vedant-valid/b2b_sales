import { prisma } from "../lib/prisma.js";
import { generateDraft as realGenerateDraft } from "../services/emailGen.js";
import { renderTemplate as realRenderTemplate } from "../services/templateEngine.js";
import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "generate-email";

const DEFAULT_PROFILE = {
  senderName: "Outreach Team",
  senderCompany: "NST",
  valueProp: "NST students build production-grade systems and are job-ready"
};

function buildTestDraft(lead) {
  return {
    subject: "Campaign Automation Test | Vedant Madne",
    body: `Hi ${lead.firstName},\n\nThis is a quick test email as part of a campaign automation demo built by Vedant Madne.\n\nWe are validating the end-to-end outreach pipeline — lead enrichment, AI-based email generation, and dispatch via Instantly.ai. No action needed on your end; this is purely to confirm delivery and pipeline functionality.\n\nThanks for being part of the demo!\n\n- Vedant`
  };
}

let generateDraft = realGenerateDraft;
export function __setGenerateDraft(fn) { generateDraft = fn; }

let renderTemplate = realRenderTemplate;
export function __setRenderTemplate(fn) { renderTemplate = fn; }

export async function runGenerateEmailJob(job) {
  const { leadId, autoDispatch = false } = job.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`lead ${leadId} not found`);

  const campaign = await prisma.campaign.findUnique({ where: { id: lead.campaignId } });

  let draft;
  if (campaign?.mode === "TEST") {
    draft = buildTestDraft(lead);
  } else if (campaign?.emailMode === "TEMPLATE" && campaign.emailTemplateSubject && campaign.emailTemplateBody) {
    draft = await renderTemplate(campaign.emailTemplateSubject, campaign.emailTemplateBody, lead);
  } else {
    const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    draft = await generateDraft(lead, DEFAULT_PROFILE, { brandDoc: brandDoc?.content ?? null });
  }
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
        isEnriched: true,
        email: { not: null },
        emails: { none: {} }
      }
    });
    if (pendingLeads === 0) {
      if (campaign?.mode === "TEST") {
        // TEST campaigns skip email approval — dispatch immediately
        const boss = await getBoss();
        await boss.send("dispatch-to-instantly", { campaignId: lead.campaignId });
        logger.info(`TEST campaign ${lead.campaignId} dispatching immediately`);
      } else {
        await prisma.campaign.update({
          where: { id: lead.campaignId },
          data: { status: "AWAITING_EMAIL_APPROVAL" }
        });
        logger.info(`campaign ${lead.campaignId} awaiting email approval`);
      }
    }
  }

  return { emailId: email.id, version };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runGenerateEmailJob);
}
