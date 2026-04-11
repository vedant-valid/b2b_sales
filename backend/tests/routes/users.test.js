import request from "supertest";
import { createApp } from "../../app.js";
import { resetDb } from "../setup.js";
import { createUser, authHeader } from "../helpers/factory.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });

describe("users routes", () => {
  test("GET /api/users forbidden for non-admin", async () => {
    const { token } = await createUser({ role: "VIEWER" });
    const res = await request(app).get("/api/users").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users returns list for admin", async () => {
    const { token } = await createUser({ role: "ADMIN", email: "admin@x.com" });
    await createUser({ email: "u2@x.com" });
    const res = await request(app).get("/api/users").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(2);
    expect(res.body.users[0].password).toBeUndefined();
  });

  test("POST /api/users creates user (admin)", async () => {
    const { token } = await createUser({ role: "ADMIN", email: "admin@x.com" });
    const res = await request(app).post("/api/users")
      .set(authHeader(token))
      .send({ email: "new@x.com", password: "secret123", role: "MANAGER", name: "New" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("new@x.com");
  });

  test("PATCH /api/users/:id/role updates role (admin)", async () => {
    const { token } = await createUser({ role: "ADMIN", email: "admin@x.com" });
    const { user } = await createUser({ email: "u@x.com", role: "VIEWER" });
    const res = await request(app).patch(`/api/users/${user.id}/role`)
      .set(authHeader(token))
      .send({ role: "MANAGER" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("MANAGER");
  });
});
