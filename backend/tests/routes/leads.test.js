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

  test("GET /api/leads?hasSentEmail=true only returns leads with a SENT email", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `v4${Date.now()}${Math.random()}@x.com` });
    const leadWithEmail = await seedLead();
    const leadWithout = await seedLead();
    await prisma.email.create({
      data: { leadId: leadWithEmail.id, subject: "Hi", body: "Hello", status: "SENT", sentAt: new Date() }
    });
    const res = await request(app).get("/api/leads?hasSentEmail=true").set(authHeader(token));
    expect(res.status).toBe(200);
    const ids = res.body.leads.map(l => l.id);
    expect(ids).toContain(leadWithEmail.id);
    expect(ids).not.toContain(leadWithout.id);
  });
});

describe("GET /api/leads/:id/thread", () => {
  test("returns emails and replies merged in chronological order", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `vt${Date.now()}${Math.random()}@x.com` });
    const lead = await seedLead();
    await prisma.email.create({
      data: { leadId: lead.id, subject: "Hello", body: "Hi Alice", status: "SENT", sentAt: new Date("2026-01-01T10:00:00Z") }
    });
    await prisma.reply.create({
      data: { leadId: lead.id, body: "Interested!", sentiment: "INTERESTED", receivedAt: new Date("2026-01-01T11:00:00Z") }
    });
    const res = await request(app).get(`/api/leads/${lead.id}/thread`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].direction).toBe("outbound");
    expect(res.body.messages[0].subject).toBe("Hello");
    expect(res.body.messages[1].direction).toBe("inbound");
    expect(res.body.messages[1].sentiment).toBe("INTERESTED");
  });

  test("returns 404 for unknown lead", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `vt2${Date.now()}${Math.random()}@x.com` });
    const res = await request(app).get("/api/leads/nonexistent/thread").set(authHeader(token));
    expect(res.status).toBe(404);
  });

  test("excludes DRAFT emails from the thread", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `vt3${Date.now()}${Math.random()}@x.com` });
    const lead = await seedLead();
    await prisma.email.create({
      data: { leadId: lead.id, subject: "Draft", body: "Not sent yet", status: "DRAFT" }
    });
    const res = await request(app).get(`/api/leads/${lead.id}/thread`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(0);
  });
});
