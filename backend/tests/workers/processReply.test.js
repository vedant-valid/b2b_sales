import { jest } from "@jest/globals";
import { runProcessReplyJob, __setReplyHandlerImpl } from "../../workers/processReply.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

const mockHandler = {
  classifySentiment: jest.fn().mockResolvedValue("INTERESTED"),
  draftFollowUp: jest.fn().mockResolvedValue("How about Tuesday at 10am?")
};

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  __setReplyHandlerImpl(mockHandler);
});

async function makeLeadWithCampaign() {
  const { user } = await createUser({ email: `u${Date.now()}${Math.random()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "Jo", lastName: "Doe", email: "jo@x.com", campaignId: campaign.id }
  });
  return lead;
}

describe("processReply worker", () => {
  test("creates Reply and updates lead status based on sentiment", async () => {
    const lead = await makeLeadWithCampaign();
    const receivedAt = new Date("2024-06-01T10:00:00Z").toISOString();

    await runProcessReplyJob({
      data: { leadEmail: "jo@x.com", body: "Yes, love to chat!", receivedAt }
    });

    const reply = await prisma.reply.findFirst({ where: { leadId: lead.id } });
    expect(reply).not.toBeNull();
    expect(reply.sentiment).toBe("INTERESTED");
    expect(reply.draftFollowUp).toBe("How about Tuesday at 10am?");

    const updated = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updated.status).toBe("INTERESTED");
  });

  test("skips duplicate replies for same (lead, receivedAt)", async () => {
    const lead = await makeLeadWithCampaign();
    const receivedAt = new Date("2024-06-01T11:00:00Z").toISOString();
    const job = { data: { leadEmail: "jo@x.com", body: "Duplicate!", receivedAt } };

    await runProcessReplyJob(job);
    await runProcessReplyJob(job);

    const replies = await prisma.reply.findMany({ where: { leadId: lead.id } });
    expect(replies).toHaveLength(1);
    expect(mockHandler.classifySentiment).toHaveBeenCalledTimes(1);
  });

  test("silently skips when lead email is not found", async () => {
    await runProcessReplyJob({
      data: { leadEmail: "nobody@x.com", body: "hello", receivedAt: new Date().toISOString() }
    });
    expect(mockHandler.classifySentiment).not.toHaveBeenCalled();
  });

  test("maps each sentiment to the correct lead status", async () => {
    for (const [sentiment, expectedStatus] of [
      ["NOT_INTERESTED", "NOT_INTERESTED"],
      ["NEUTRAL", "NEUTRAL"],
      ["CONVERTIBLE", "CONVERTIBLE"]
    ]) {
      await resetDb();
      mockHandler.classifySentiment.mockResolvedValueOnce(sentiment);
      const lead = await makeLeadWithCampaign();

      await runProcessReplyJob({
        data: {
          leadEmail: "jo@x.com",
          body: "Some reply",
          receivedAt: new Date().toISOString()
        }
      });

      const updated = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(updated.status).toBe(expectedStatus);
    }
  });
});
