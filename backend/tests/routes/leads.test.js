import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });

async function seedLead(extra = {}) {
  const { user } = await createUser({ email: `u${Date.now()}${Math.random()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  return prisma.lead.create({
    data: {
      firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme",
      email: "alice@acme.com", campaignId: campaign.id, ...extra
    }
  });
}

describe("leads routes", () => {
  test("GET /api/leads lists leads", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `v${Date.now()}${Math.random()}@x.com` });
    await seedLead();
    const res = await request(app).get("/api/leads").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.leads.length).toBeGreaterThan(0);
  });

  test("GET /api/leads filters by campaign", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `v2${Date.now()}${Math.random()}@x.com` });
    const lead = await seedLead();
    const res = await request(app).get(`/api/leads?campaignId=${lead.campaignId}`).set(authHeader(token));
    expect(res.body.leads).toHaveLength(1);
  });

  test("PATCH /api/leads/:id updates status (manager)", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `m${Date.now()}${Math.random()}@x.com` });
    const lead = await seedLead();
    const res = await request(app).patch(`/api/leads/${lead.id}`)
      .set(authHeader(token))
      .send({ status: "INTERESTED" });
    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe("INTERESTED");
  });

  test("PATCH /api/leads/:id forbidden for viewer", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `v3${Date.now()}${Math.random()}@x.com` });
    const lead = await seedLead();
    const res = await request(app).patch(`/api/leads/${lead.id}`)
      .set(authHeader(token))
      .send({ status: "INTERESTED" });
    expect(res.status).toBe(403);
  });
});
