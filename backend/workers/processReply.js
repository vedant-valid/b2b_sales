import { prisma } from "../lib/prisma.js";
import { classifySentiment as realClassify, draftFollowUp as realDraftFollowUp } from "../services/replyHandler.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "process-reply";

let replyHandler = { classifySentiment: realClassify, draftFollowUp: realDraftFollowUp };
export function __setReplyHandlerImpl(impl) { replyHandler = impl; }

// Strip the quoted original email that most clients append below the reply.
// Stops at the first line that looks like a quote header or quote marker.
function stripEmailQuotes(text) {
  if (!text) return text;
  const lines = text.split("\n");
  const result = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^>/.test(t)) break;
    if (/^On .+wrote:/.test(t)) break;
    if (/^-{3,}/.test(t)) break;
    if (/^_{3,}/.test(t)) break;
    if (/^From:\s/i.test(t)) break;
    result.push(line);
  }
  return result.join("\n").trim();
}

const SENTIMENT_TO_STATUS = {
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  NEUTRAL: "NEUTRAL",
  CONVERTIBLE: "CONVERTIBLE"
};

export async function runProcessReplyJob(job) {
  const { leadEmail, receivedAt } = job.data;
  const body = stripEmailQuotes(job.data.body);
  // Prefer the most recently-contacted lead; fall back to any lead with this email
  const lead =
    (await prisma.lead.findFirst({ where: { email: leadEmail, status: "CONTACTED" }, orderBy: { createdAt: "desc" } })) ||
    (await prisma.lead.findFirst({ where: { email: leadEmail }, orderBy: { createdAt: "desc" } }));
  if (!lead) { logger.warn(`process-reply: no lead for ${leadEmail}`); return; }

  const receivedDate = new Date(receivedAt);

  // Idempotency: skip if reply already exists for (leadId, receivedAt)
  const existing = await prisma.reply.findUnique({
    where: { leadId_receivedAt: { leadId: lead.id, receivedAt: receivedDate } }
  });
  if (existing) { logger.info(`process-reply: duplicate skipped for lead ${lead.id}`); return; }

  const sentiment = await replyHandler.classifySentiment(body);
  const follow = await replyHandler.draftFollowUp(body, lead, sentiment);

  await prisma.reply.create({
    data: {
      leadId: lead.id,
      body,
      sentiment,
      draftFollowUp: follow,
      receivedAt: receivedDate
    }
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: SENTIMENT_TO_STATUS[sentiment] || "REPLIED" }
  });
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 3, teamConcurrency: 3 }, runProcessReplyJob);
}
