import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { stopBoss } from "../../lib/pgboss.js";
import { __setExtractFilters } from "../../routes/campaigns.js";
import { __setGenerateSequenceImpl, __setReviseSequenceImpl, __setInstantlyImpl } from "../../routes/sequence.js";
import { HttpError } from "../../middleware/errorHandler.js";

const app = createApp();
const FAKE_STEPS = [
  { stepNumber: 1, delayDays: 0, subject: "Hi {{firstName}}", body: "Step 1 body here." },
  { stepNumber: 2, delayDays: 3, subject: "Following up", body: "Step 2 follow-up body." },
];

let updateCampaignSequence;

beforeEach(async () => {
  await resetDb();
  __setExtractFilters(async () => ({ filters: {}, confidence: 0.9, needsClarification: false }));
  __setGenerateSequenceImpl(async () => FAKE_STEPS);
  __setReviseSequenceImpl(async () => FAKE_STEPS.map(s => ({ ...s, subject: "Revised " + s.subject })));
  updateCampaignSequence = jest.fn().mockResolvedValue(undefined);
  __setInstantlyImpl({ updateCampaignSequence });
});
afterAll(async () => { await stopBoss(); });

async function makeManager() {
  return createUser({ role: "MANAGER" });
}

async function makeCampaign(token) {
  const res = await request(app)
    .post("/api/campaigns")
    .set(authHeader(token))
    .send({ name: "Seq Test", rawGoal: "Find CTOs in India", mode: "TEST", testEmails: ["a@b.com"] });
  return res.body.campaign.id;
}

describe("GET /api/campaigns/:id/sequence", () => {
  test("returns empty steps and sequenceApproved=false for new campaign", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.steps).toEqual([]);
    expect(res.body.sequenceApproved).toBe(false);
  });

  test("401 without token", async () => {
    const res = await request(app).get("/api/campaigns/fake/sequence");
    expect(res.status).toBe(401);
  });

  test("404 for unknown campaign id", async () => {
    const { token } = await makeManager();
    const res = await request(app).get("/api/campaigns/nonexistent-id/sequence").set(authHeader(token));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/campaigns/:id/sequence/generate", () => {
  test("generates and saves steps, returns them", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/generate`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[0].stepNumber).toBe(1);
    expect(res.body.steps[0].delayDays).toBe(0);
    expect(res.body.steps[1].delayDays).toBe(3);
  });

  test("resets sequenceApproved to false on regenerate", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const approveRes = await request(app).post(`/api/campaigns/${id}/sequence/approve`).set(authHeader(token));
    expect(approveRes.status).toBe(200);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const check = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(check.body.sequenceApproved).toBe(false);
  });

  test("403 for VIEWER", async () => {
    const { token: mgr } = await makeManager();
    const id = await makeCampaign(mgr);
    const { token: viewer } = await createUser({ role: "VIEWER", email: "v@x.com" });
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/generate`)
      .set(authHeader(viewer));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/campaigns/:id/sequence", () => {
  test("saves edited steps and resets approval", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const edited = [
      { stepNumber: 1, delayDays: 0, subject: "Edited subject", body: "Edited body." },
      { stepNumber: 2, delayDays: 5, subject: "Edited follow-up", body: "Edited follow-up body." },
    ];
    const res = await request(app)
      .put(`/api/campaigns/${id}/sequence`)
      .set(authHeader(token))
      .send({ steps: edited });
    expect(res.status).toBe(200);
    expect(res.body.steps[0].subject).toBe("Edited subject");
    expect(res.body.steps[1].delayDays).toBe(5);
  });

  test("400 on invalid input (missing stepNumber)", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .put(`/api/campaigns/${id}/sequence`)
      .set(authHeader(token))
      .send({ steps: [{ subject: "x", body: "y", delayDays: 0 }] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/campaigns/:id/sequence/revise", () => {
  test("revises steps via AI and returns updated steps", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/revise`)
      .set(authHeader(token))
      .send({ prompt: "make step 1 shorter" });
    expect(res.status).toBe(200);
    expect(res.body.steps[0].subject).toMatch(/^Revised /);
  });

  test("400 when no sequence exists yet", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/revise`)
      .set(authHeader(token))
      .send({ prompt: "make it shorter" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_sequence");
  });
});

describe("POST /api/campaigns/:id/sequence/approve", () => {
  test("sets sequenceApproved true", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.sequenceApproved).toBe(true);
    const check = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(check.body.sequenceApproved).toBe(true);
  });

  test("400 when approving a campaign with no steps", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_sequence");
  });

  test("does not push to Instantly when the campaign has no instantlyCampaignId", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(updateCampaignSequence).not.toHaveBeenCalled();
  });

  test("pushes the approved sequence to Instantly when already dispatched", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await prisma.campaign.update({ where: { id }, data: { instantlyCampaignId: "cmp_live_123" } });
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.sequenceApproved).toBe(true);

    expect(updateCampaignSequence).toHaveBeenCalledTimes(1);
    const [calledCampaignId, calledSteps] = updateCampaignSequence.mock.calls[0];
    expect(calledCampaignId).toBe("cmp_live_123");
    expect(calledSteps).toHaveLength(2);
    expect(calledSteps[0].subject).toBe(FAKE_STEPS[0].subject);
    expect(calledSteps[1].subject).toBe(FAKE_STEPS[1].subject);
  });

  test("502 and sequenceApproved stays false when the Instantly push fails", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await prisma.campaign.update({ where: { id }, data: { instantlyCampaignId: "cmp_live_123" } });
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    updateCampaignSequence.mockRejectedValue(new HttpError(502, "instantly_error", "instantly API error 500 on PATCH /api/v2/campaigns/cmp_live_123: {}"));

    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("instantly_error");

    const check = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(check.body.sequenceApproved).toBe(false);
  });
});
