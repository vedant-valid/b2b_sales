import { jest } from "@jest/globals";
import { createCampaign, pushLeads, sendSubsequence } from "../../services/instantly.js";

function makeFetch(responses) {
  const calls = [];
  const fn = jest.fn().mockImplementation(async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body
    };
  });
  fn.calls = calls;
  return fn;
}

describe("instantly service", () => {
  test("createCampaign returns instantlyCampaignId", async () => {
    const fetch = makeFetch([
      { status: 200, body: { id: "cmp_123", name: "X" } }
    ]);
    const out = await createCampaign("X", { fetch });
    expect(out.instantlyCampaignId).toBe("cmp_123");
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toMatch(/\/campaigns$/);
    const body = JSON.parse(fetch.calls[0].init.body);
    expect(body.name).toBe("X");
  });

  test("throws on non-2xx from campaign creation", async () => {
    const fetch = makeFetch([{ status: 400, body: { error: "bad" } }]);
    await expect(createCampaign("X", { fetch })).rejects.toThrow(/instantly/);
  });

  test("pushLeads reports accepted and rejected per-lead", async () => {
    const fetch = makeFetch([
      { status: 200, body: {} },
      { status: 200, body: {} },
      { status: 400, body: { error: "invalid" } }
    ]);
    const out = await pushLeads("cmp_123", [
      { email: "a@x.com", firstName: "A", lastName: "B", company: "Acme", subject: "S", body: "B" },
      { email: "c@x.com", firstName: "C", lastName: "D", company: "Delta", subject: "S", body: "B" },
      { email: "bad@x.com", firstName: "X", lastName: "Y", company: "Zulu", subject: "S", body: "B" }
    ], { fetch });
    expect(out.accepted).toBe(2);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].email).toBe("bad@x.com");
  });

  test("sendSubsequence calls subsequence endpoint", async () => {
    const fetch = makeFetch([{ status: 200, body: { ok: true } }]);
    await expect(sendSubsequence("cmp_123", "lead@x.com", "follow-up body", { fetch })).resolves.not.toThrow();
    expect(fetch.calls[0].url).toMatch(/subsequences/);
  });

  test("throws on non-2xx from campaign creation", async () => {
    const fetch = makeFetch([{ status: 500, body: { error: "server" } }]);
    await expect(createCampaign("X", { fetch })).rejects.toThrow(/instantly/);
  });
});
