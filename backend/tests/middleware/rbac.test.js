import request from "supertest";
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { signToken } from "../../lib/auth.js";
import { createUser } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

function makeApp() {
  const app = express();
  app.get("/admin", requireAuth, requireRole("ADMIN"), (_req, res) => res.json({ ok: true }));
  app.get("/mgr", requireAuth, requireRole("ADMIN", "MANAGER"), (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(resetDb);

describe("requireRole", () => {
  test("403 when role not permitted", async () => {
    const { user } = await createUser({ role: "VIEWER" });
    const token = signToken({ sub: user.id, role: "VIEWER" });
    const res = await request(makeApp()).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("200 when role matches", async () => {
    const { user } = await createUser({ role: "ADMIN" });
    const token = signToken({ sub: user.id, role: "ADMIN" });
    const res = await request(makeApp()).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("200 when role in allow list", async () => {
    const { user } = await createUser({ role: "MANAGER" });
    const token = signToken({ sub: user.id, role: "MANAGER" });
    const res = await request(makeApp()).get("/mgr").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
