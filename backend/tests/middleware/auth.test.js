import request from "supertest";
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { signToken } from "../../lib/auth.js";
import { createUser } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

function makeApp() {
  const app = express();
  app.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
  return app;
}

beforeEach(resetDb);

describe("requireAuth", () => {
  test("401 when header missing", async () => {
    const res = await request(makeApp()).get("/me");
    expect(res.status).toBe(401);
  });

  test("401 when token invalid", async () => {
    const res = await request(makeApp()).get("/me").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
  });

  test("401 when user no longer exists in DB", async () => {
    const token = signToken({ sub: "deleted-user-id", role: "ADMIN" });
    const res = await request(makeApp()).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test("attaches user payload on success", async () => {
    const { user } = await createUser({ role: "ADMIN" });
    const token = signToken({ sub: user.id, role: "ADMIN" });
    const res = await request(makeApp()).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe(user.id);
  });
});
