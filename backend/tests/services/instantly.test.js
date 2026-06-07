import { jest } from "@jest/globals";
import { createCampaign, pushLeads, sendSubsequence, mapSequenceBody } from "../../services/instantly.js";

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
    const fetch = makeFetch([
      { status: 200, body: { id: "sub_123" } },                       // createFollowUpSubsequence
      { status: 200, body: { items: [{ id: "lead_456" }] } },         // lookupInstantlyLeadId
      { status: 200, body: { ok: true } },                            // moveLeadToSubsequence
    ]);
    await expect(sendSubsequence("cmp_123", "lead@x.com", "follow-up body", { fetch })).resolves.not.toThrow();
    expect(fetch.calls[0].url).toMatch(/subsequences/);
  });

  test("throws on non-2xx from campaign creation", async () => {
    const fetch = makeFetch([{ status: 500, body: { error: "server" } }]);
    await expect(createCampaign("X", { fetch })).rejects.toThrow(/instantly/);
  });

  test("createCampaign builds a multi-step sequence from sequenceSteps", async () => {
    const fetch = makeFetch([
      { status: 200, body: { id: "cmp_seq" } }
    ]);
    const sequenceSteps = [
      { stepNumber: 1, subject: "Quick question for {{firstName}}", body: "Hi {{firstName}}, this is the AI-written intro copy that should be discarded in favor of the per-lead draft", delayDays: 0 },
      { stepNumber: 2, subject: "Following up", body: "Hi {{firstName}} from {{company}} — {{aiPersonalization}}", delayDays: 3 }
    ];
    const out = await createCampaign("X", { sequenceSteps, fetch });
    expect(out.instantlyCampaignId).toBe("cmp_seq");

    const body = JSON.parse(fetch.calls[0].init.body);
    const steps = body.sequences[0].steps;
    expect(steps).toHaveLength(2);

    expect(steps[0].delay).toBe(0);
    expect(steps[0].delay_unit).toBe("minutes");
    expect(steps[0].variants[0].subject).toBe("Quick question for {{firstName}}");
    expect(steps[0].variants[0].body).toBe("{{personalization}}");

    expect(steps[1].delay).toBe(3);
    expect(steps[1].delay_unit).toBe("days");
    expect(steps[1].variants[0].subject).toBe("Following up");
    expect(steps[1].variants[0].body).toBe("Hi {{firstName}} from {{companyName}} — ");
  });

  test("createCampaign falls back to hardcoded single step when sequenceSteps is empty", async () => {
    const fetch = makeFetch([
      { status: 200, body: { id: "cmp_empty" } }
    ]);
    await createCampaign("X", { sequenceSteps: [], fetch });
    const body = JSON.parse(fetch.calls[0].init.body);
    expect(body.sequences[0].steps).toHaveLength(1);
    expect(body.sequences[0].steps[0].variants[0].body).toBe("{{personalization}}");
  });
});

describe("mapSequenceBody", () => {
  test("passes firstName, lastName and title through unchanged", () => {
    expect(mapSequenceBody("Hi {{firstName}} {{lastName}}, {{title}}")).toBe("Hi {{firstName}} {{lastName}}, {{title}}");
  });

  test("renames company to companyName", () => {
    expect(mapSequenceBody("at {{company}}")).toBe("at {{companyName}}");
  });

  test("strips aiPersonalization", () => {
    expect(mapSequenceBody("Hello — {{aiPersonalization}} — bye")).toBe("Hello —  — bye");
  });
});
