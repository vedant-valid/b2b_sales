import { prisma } from "../lib/prisma.js";
import { getRecentReplies as realGetReplies } from "../services/instantly.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "poll-replies";

// Poll window: last 24 hours — idempotency in processReply prevents double-processing
const POLL_WINDOW_MS = 24 * 60 * 60 * 1000;

let getRecentReplies = realGetReplies;
export function __setGetRecentRepliesImpl(impl) { getRecentReplies = impl; }

export async function runPollRepliesJob(job, boss) {
  const sinceDate = new Date(Date.now() - POLL_WINDOW_MS).toISOString();

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["RUNNING", "COMPLETED"] },
      instantlyCampaignId: { not: null }
    },
    select: { id: true, instantlyCampaignId: true }
  });

  if (campaigns.length === 0) {
    logger.info("poll-replies: no active campaigns to poll");
    return;
  }

  let total = 0;
  for (const campaign of campaigns) {
    try {
      const replies = await getRecentReplies(campaign.instantlyCampaignId, sinceDate);
      for (const reply of replies) {
        const leadEmail = reply.lead_email ?? reply.email ?? reply.from_email;
        const body      = reply.body ?? reply.text ?? reply.content ?? "";
        const receivedAt = reply.created_at ?? reply.timestamp ?? new Date().toISOString();

        if (!leadEmail || !body) continue;

        await boss.send("process-reply", { leadEmail, body, receivedAt });
        total++;
      }
    } catch (err) {
      logger.error(`poll-replies: campaign ${campaign.id} failed — ${err.message}`);
    }
  }

  logger.info(`poll-replies: queued ${total} replies from ${campaigns.length} campaigns`);
}

export async function register(boss) {
  // Run every 5 minutes
  await boss.schedule(QUEUE, "*/5 * * * *", {});
  await boss.work(QUEUE, (job) => runPollRepliesJob(job, boss));
  logger.info("poll-replies: scheduled every 5 minutes");
}
