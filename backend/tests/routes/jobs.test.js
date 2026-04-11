import request from "supertest";
import { createApp } from "../../app.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { getBoss, stopBoss } from "../../lib/pgboss.js";

const app = createApp();

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await stopBoss(); });

describe("GET /api/jobs/:id", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get("/api/jobs/fake-id");
    expect(res.status).toBe(401);
  });

  test("returns job state for real job", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const boss = await getBoss();
    const jobId = await boss.send("test-queue", { hello: "world" });
    const res = await request(app).get(`/api/jobs/${jobId}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.job.id).toBe(jobId);
    expect(["created", "active", "completed", "retry"]).toContain(res.body.job.state);
  });

  test("404 on unknown job", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/jobs/00000000-0000-0000-0000-000000000000").set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
