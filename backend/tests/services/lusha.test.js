import { jest } from "@jest/globals";
import { searchLeads, enrichContact } from "../../services/lusha.js";

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

describe("lusha service", () => {
  test("searchLeads returns normalized leads", async () => {
    const fetch = makeFetch([{ status: 200, body: {
      data: [{
        id: "p1", firstName: "Alice", lastName: "Smith",
        jobTitle: "Head of Engineering", companyName: "Acme",
        location: { country: "India" }, linkedinUrl: "https://linkedin.com/in/alice",
        department: "Engineering", seniority: "Director"
      }],
      total: 1
    }}]);
    const leads = await searchLeads({ titles: ["Head of Engineering"], locations: ["India"] }, { fetch });
    expect(leads).toHaveLength(1);
    expect(leads[0].firstName).toBe("Alice");
    expect(leads[0].lushaPersonId).toBe("p1");
    expect(leads[0].title).toBe("Head of Engineering");
    expect(leads[0].company).toBe("Acme");
    expect(leads[0].location).toBe("India");
  });

  test("retries on 429 with backoff", async () => {
    const fetch = makeFetch([
      { status: 429, body: { error: "rate_limited" } },
      { status: 200, body: { data: [], total: 0 } }
    ]);
    const leads = await searchLeads({ titles: ["CTO"] }, { fetch, retryDelayMs: 1 });
    expect(leads).toEqual([]);
    expect(fetch.calls.length).toBe(2);
  });

  test("enrichContact returns email and phone", async () => {
    const fetch = makeFetch([{ status: 200, body: {
      data: { email: "alice@acme.com", phoneNumber: "+911234567890" }
    }}]);
    const contact = await enrichContact("p1", { fetch });
    expect(contact.email).toBe("alice@acme.com");
    expect(contact.phone).toBe("+911234567890");
  });

  test("throws after exhausting retries on persistent 429", async () => {
    const responses = [
      { status: 429, body: {} }, { status: 429, body: {} },
      { status: 429, body: {} }, { status: 429, body: {} }
    ];
    const fetch = makeFetch(responses);
    await expect(searchLeads({}, { fetch, retryDelayMs: 1, retries: 3 }))
      .rejects.toThrow(/429/);
  });
});
