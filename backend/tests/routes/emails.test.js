import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { stopBoss } from "../../lib/pgboss.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await stopBoss(); });

async function seedLeadWithEmail() {
  const { user } = await createUser({ email: `u${Date.now()}${Math.random()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
  });
  const email = await prisma.email.create({
    data: { leadId: lead.id, subject: "Hi", body: "Body", version: 1 }
  });
  return { user, campaign, lead, email };
}

describe("email routes", () => {
  test("GET /api/leads/:id/emails returns history", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `v${Date.now()}${Math.random()}@x.com` });
    const { lead } = await seedLeadWithEmail();
    const res = await request(app).get(`/api/leads/${lead.id}/emails`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.emails).toHaveLength(1);
  });

  test("POST /api/leads/:id/emails enqueues generate-email (manager)", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `m${Date.now()}${Math.random()}@x.com` });
    const { lead } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/leads/${lead.id}/emails`).set(authHeader(token));
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
  });

  test("POST /api/emails/:id/regenerate enqueues (manager)", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `m2${Date.now()}${Math.random()}@x.com` });
    const { email } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/emails/${email.id}/regenerate`).set(authHeader(token));
    expect(res.status).toBe(202);
  });

  test("POST /api/emails/:id/regenerate forbidden for viewer", async () => {
    const { token } = await createUser({ role: "VIEWER", email: `v2${Date.now()}${Math.random()}@x.com` });
    const { email } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/emails/${email.id}/regenerate`).set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("POST /api/emails/:id/send marks SENT and lead CONTACTED", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `m3${Date.now()}${Math.random()}@x.com` });
    const { email, lead } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/emails/${email.id}/send`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.email.status).toBe("SENT");
    expect(res.body.email.sentAt).toBeDefined();
    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead.status).toBe("CONTACTED");
  });
});
