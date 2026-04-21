import { jest } from "@jest/globals";
import { runFetchLeadsJob, __setLushaImpl } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";
beforeEach(async () => { await resetDb(); });

describe("fetchLeads worker", () => {
  test("stores enriched leads and sets status to AWAITING_LEAD_APPROVAL", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-1", firstName: "A", lastName: "B", email: "a@x.com", title: "CTO", company: "Acme", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" },
        { lushaContactId: "uuid-2", firstName: "C", lastName: "D", email: "c@x.com", title: "VP Eng", company: "Beta", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "vice president" }
      ])
    });

    const { user } = await createUser({ role: "MANAGER", email: `u${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: {
        name: "X", rawGoal: "g",
        extractedFilters: { seniorities: ["director"], departments: ["Engineering & Technical"], locations: ["India"] },
        createdById: user.id
      }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(2);
    expect(leads.map(l => l.email)).toEqual(expect.arrayContaining(["a@x.com", "c@x.com"]));

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_APPROVAL");
  });

  test("zero leads from Lusha → campaign COMPLETED", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([])
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
