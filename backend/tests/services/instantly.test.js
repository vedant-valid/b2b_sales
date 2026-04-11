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
  test("createCampaign returns id", async () => {
    const fetch = makeFetch([{ status: 200, body: { id: "cmp_123", name: "X" } }]);
    const out = await createCampaign("X", { fetch });
    expect(out.instantlyCampaignId).toBe("cmp_123");
    expect(fetch.calls[0].url).toMatch(/campaigns/);
  });

  test("pushLeads reports accepted and rejected", async () => {
    const fetch = makeFetch([{
      status: 200,
      body: { accepted: 2, rejected: [{ email: "bad@x.com", reason: "invalid" }] }
    }]);
    const out = await pushLeads("cmp_123", [
      { email: "a@x.com", firstName: "A", lastName: "B", company: "Acme", subject: "S", body: "B" },
      { email: "c@x.com", firstName: "C", lastName: "D", company: "Delta", subject: "S", body: "B" },
      { email: "bad@x.com", firstName: "X", lastName: "Y", company: "Zulu", subject: "S", body: "B" }
    ], { fetch });
    expect(out.accepted).toBe(2);
    expect(out.rejected).toHaveLength(1);
  });

  test("sendSubsequence calls subsequence endpoint", async () => {
    const fetch = makeFetch([{ status: 200, body: { ok: true } }]);
    await expect(sendSubsequence("cmp_123", "lead@x.com", "follow-up body", { fetch })).resolves.not.toThrow();
    expect(fetch.calls[0].url).toMatch(/subsequences/);
  });

  test("throws on non-2xx", async () => {
    const fetch = makeFetch([{ status: 500, body: { error: "server" } }]);
    await expect(createCampaign("X", { fetch })).rejects.toThrow(/instantly/);
  });
});
