import { prisma } from "../lib/prisma.js";
import { classifySentiment, draftFollowUp } from "../services/replyHandler.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "process-reply";

const SENTIMENT_TO_STATUS = {
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  NEUTRAL: "NEUTRAL",
  CONVERTIBLE: "CONVERTIBLE"
};

export async function runProcessReplyJob(job) {
  const { leadEmail, body, receivedAt } = job.data;
  const lead = await prisma.lead.findFirst({ where: { email: leadEmail } });
  if (!lead) { logger.warn(`process-reply: no lead for ${leadEmail}`); return; }

  const receivedDate = new Date(receivedAt);

  // Idempotency: skip if reply already exists for (leadId, receivedAt)
  const existing = await prisma.reply.findUnique({
    where: { leadId_receivedAt: { leadId: lead.id, receivedAt: receivedDate } }
  });
  if (existing) { logger.info(`process-reply: duplicate skipped for lead ${lead.id}`); return; }

  const sentiment = await classifySentiment(body);
  const follow = await draftFollowUp(body, lead, sentiment);

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
