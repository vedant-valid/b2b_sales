import request from "supertest";
import { createApp } from "../app.js";

describe("app", () => {
  const app = createApp();

  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("unknown route returns 404", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
  });
});
