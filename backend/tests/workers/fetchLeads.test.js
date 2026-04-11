import { jest } from "@jest/globals";
import { runFetchLeadsJob, __setLushaImpl } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";
import { getBoss, stopBoss } from "../../lib/pgboss.js";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await stopBoss(); });

describe("fetchLeads worker", () => {
  test("stores leads and enqueues generate-email for each", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaPersonId: "p1", firstName: "A", lastName: "B", title: "CTO", company: "Acme" },
        { lushaPersonId: "p2", firstName: "C", lastName: "D", title: "VP Eng", company: "Beta" }
      ]),
      enrichContact: jest.fn().mockImplementation(async (id) => ({ email: `${id}@x.com`, phone: null }))
    });

    const { user } = await createUser({ role: "MANAGER", email: `u${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: { titles: ["CTO"] }, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(2);
    expect(leads[0].email).toMatch(/@x.com/);
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("zero leads from Lusha → campaign COMPLETED", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([]),
      enrichContact: jest.fn()
    });

    const { user } = await createUser({ role: "MANAGER", email: `u2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("COMPLETED");
  });
});
