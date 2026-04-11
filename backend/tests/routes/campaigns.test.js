import request from "supertest";
import { createApp } from "../../app.js";
import { __setExtractFilters } from "../../routes/campaigns.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  __setExtractFilters(async () => ({
    filters: { titles: ["Head of Engineering"], locations: ["India"] },
    confidence: 0.9,
    needsClarification: false
  }));
});

describe("campaigns routes", () => {
  test("POST /api/campaigns creates DRAFT with extracted filters", async () => {
    const { token } = await createUser({ role: "MANAGER" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "Q2 Hiring", rawGoal: "Heads of Engineering at unicorn startups in India" });
    expect(res.status).toBe(201);
    expect(res.body.campaign.status).toBe("DRAFT");
    expect(res.body.campaign.extractedFilters.titles).toContain("Head of Engineering");
  });

  test("POST /api/campaigns forbidden for VIEWER", async () => {
    const { token } = await createUser({ role: "VIEWER" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "X", rawGoal: "goal here" });
    expect(res.status).toBe(403);
  });

  test("POST /api/campaigns returns 422 on low-confidence extraction", async () => {
    __setExtractFilters(async () => ({
      filters: {},
      confidence: 0.3,
      needsClarification: true,
      clarification: "Please specify a target role"
    }));
    const { token } = await createUser({ role: "MANAGER", email: "m2@x.com" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "X", rawGoal: "please" });
    expect(res.status).toBe(422);
    expect(res.body.clarification).toMatch(/target role/);
  });

  test("GET /api/campaigns lists user-visible campaigns", async () => {
    const { token, user } = await createUser({ role: "MANAGER", email: "m3@x.com" });
    await prisma.campaign.create({
      data: { name: "A", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const res = await request(app).get("/api/campaigns").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.campaigns.length).toBe(1);
  });

  test("GET /api/campaigns/:id returns detail", async () => {
    const { token, user } = await createUser({ role: "MANAGER", email: "m4@x.com" });
    const c = await prisma.campaign.create({
      data: { name: "A", rawGoal: "g", extractedFilters: { titles: ["X"] }, createdById: user.id }
    });
    const res = await request(app).get(`/api/campaigns/${c.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.campaign.id).toBe(c.id);
  });
});
