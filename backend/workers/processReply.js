import { prisma } from "../lib/prisma.js";
import { classifySentiment as realClassify, draftFollowUp as realDraftFollowUp } from "../services/replyHandler.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "process-reply";

let replyHandler = { classifySentiment: realClassify, draftFollowUp: realDraftFollowUp };
export function __setReplyHandlerImpl(impl) { replyHandler = impl; }

// Strip quoted original email content. Stops at quote headers/markers.
// If the entire body consists of quoted lines (Gmail inline reply style),
// fall back to stripping the > prefix from each line to recover the actual text.
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
  const stripped = result.join("\n").trim();
  if (stripped) return stripped;
  // Entire body was quoted lines — recover content by removing > prefixes
  return lines
    .map(l => l.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
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

  // Idempotency: skip if reply already exists with a body; update if body was empty
  const existing = await prisma.reply.findUnique({
    where: { leadId_receivedAt: { leadId: lead.id, receivedAt: receivedDate } }
  });
  if (existing) {
    if (existing.body || !body) { logger.info(`process-reply: duplicate skipped for lead ${lead.id}`); return; }
    // Existing reply has empty body but we now have content — backfill it
    const sentiment = await replyHandler.classifySentiment(body);
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const follow = await replyHandler.draftFollowUp(body, lead, sentiment, { brandFields });
    await prisma.reply.update({
      where: { id: existing.id },
      data: { body, sentiment, draftFollowUp: follow }
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { status: SENTIMENT_TO_STATUS[sentiment] || "REPLIED" } });
    logger.info(`process-reply: backfilled empty body for reply ${existing.id}`);
    return;
  }

  const sentiment = await replyHandler.classifySentiment(body);
  const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
  const follow = await replyHandler.draftFollowUp(body, lead, sentiment, { brandFields });

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
