import { jest } from "@jest/globals";
import { runDispatchJob, __setInstantlyImpl } from "../../workers/dispatchCampaign.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

afterAll(async () => { await resetDb(); });

beforeEach(async () => {
  await resetDb();
  __setInstantlyImpl({
    createCampaign: jest.fn().mockResolvedValue({ instantlyCampaignId: "cmp_abc" }),
    pushLeads: jest.fn().mockResolvedValue({ accepted: 2, rejected: [] }),
    activateCampaign: jest.fn().mockResolvedValue({})
  });
});

describe("dispatchCampaign worker", () => {
  test("creates Instantly campaign and pushes leads with drafts", async () => {
    const { user } = await createUser({ email: `u${Date.now()}${Math.random()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    for (const i of [1, 2]) {
      const lead = await prisma.lead.create({
        data: {
          firstName: `A${i}`, lastName: "B", email: `a${i}@x.com`,
          title: "CTO", company: "Acme", campaignId: campaign.id
        }
      });
      await prisma.email.create({
        data: { leadId: lead.id, subject: `S${i}`, body: `B${i}`, version: 1 }
      });
    }

    await runDispatchJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.instantlyCampaignId).toBe("cmp_abc");
    expect(updated.status).toBe("RUNNING");

    const sentEmails = await prisma.email.findMany({ where: { campaignId: undefined, status: "SENT" } });
    // Filter by the specific campaign's emails
    const emails = await prisma.email.findMany({
      where: { lead: { campaignId: campaign.id } }
    });
    const sent = emails.filter(e => e.status === "SENT");
    expect(sent).toHaveLength(2);

    // Leads stay NEW until Instantly fires the email_sent webhook
    const contactedLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, status: "CONTACTED" }
    });
    expect(contactedLeads).toHaveLength(0);
  });

  test("marks rejected emails as FAILED, does not contact their leads", async () => {
    __setInstantlyImpl({
      createCampaign: jest.fn().mockResolvedValue({ instantlyCampaignId: "cmp_xyz" }),
      pushLeads: jest.fn().mockResolvedValue({
        accepted: 1,
        rejected: [{ email: "bad@x.com", reason: "invalid" }]
      }),
      activateCampaign: jest.fn().mockResolvedValue({})
    });
    const { user } = await createUser({ email: `u2${Date.now()}${Math.random()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "Y", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const good = await prisma.lead.create({
      data: { firstName: "G", lastName: "D", email: "good@x.com", campaignId: campaign.id }
    });
    const bad = await prisma.lead.create({
      data: { firstName: "B", lastName: "D", email: "bad@x.com", campaignId: campaign.id }
    });
    await prisma.email.create({ data: { leadId: good.id, subject: "S", body: "B", version: 1 } });
    await prisma.email.create({ data: { leadId: bad.id, subject: "S", body: "B", version: 1 } });

    await runDispatchJob({ data: { campaignId: campaign.id } });

    const badEmails = await prisma.email.findMany({ where: { leadId: bad.id } });
    expect(badEmails[0].status).toBe("FAILED");
    const badLead = await prisma.lead.findUnique({ where: { id: bad.id } });
    expect(badLead.status).toBe("NEW"); // NOT contacted

    const goodEmails = await prisma.email.findMany({ where: { leadId: good.id } });
    expect(goodEmails[0].status).toBe("SENT");
    // Good lead stays NEW — CONTACTED is set by the email_sent webhook, not dispatch
    const goodLead = await prisma.lead.findUnique({ where: { id: good.id } });
    expect(goodLead.status).toBe("NEW");
  });
});
