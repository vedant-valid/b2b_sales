import { jest } from "@jest/globals";
import { searchLeadsBasic, enrichLeads } from "../../services/lusha.js";

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

const SEARCH_RESPONSE = {
  requestId: "req-123",
  currentPage: 0,
  totalResults: 1,
  data: [
    {
      contactId: "contact-uuid-1",
      name: "Alice Smith",
      jobTitle: "Head of Engineering",
      companyName: "Acme"
    }
  ]
};

const ENRICH_RESPONSE = {
  requestId: "req-123",
  contacts: [
    {
      id: "contact-uuid-1",
      isSuccess: true,
      error: null,
      data: {
        firstName: "Alice",
        lastName: "Smith",
        jobTitle: "Head of Engineering",
        companyName: "Acme",
        location: { country: "India" },
        emailAddresses: [{ email: "alice@acme.com", emailType: "work" }],
        phoneNumbers: [{ number: "+911234567890" }],
        socialLinks: { linkedin: "https://linkedin.com/in/alice" },
        departments: ["Engineering & Technical"],
        seniority: [{ name: "director" }]
      }
    }
  ]
};

describe("searchLeadsBasic", () => {
  test("calls only /contact/search — no enrich call, no credits", async () => {
    const fetch = makeFetch([{ status: 200, body: SEARCH_RESPONSE }]);

    const result = await searchLeadsBasic(
      { seniorities: ["director"], departments: ["Engineering & Technical"], locations: ["India"] },
      { fetch }
    );

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toMatch(/contact\/search/);

    expect(result).toHaveLength(1);
    expect(result[0].lushaContactId).toBe("contact-uuid-1");
    expect(result[0].firstName).toBe("Alice");
    expect(result[0].lastName).toBe("Smith");
    expect(result[0].title).toBe("Head of Engineering");
    expect(result[0].company).toBe("Acme");
    expect(result[0].requestId).toBe("req-123");
    // No email or phone — these come from Phase 2 enrichment
    expect(result[0].email).toBeUndefined();
    expect(result[0].phone).toBeUndefined();
  });

  test("returns empty array when search returns no contacts", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [], totalResults: 0 } }]);
    const result = await searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch });
    expect(result).toEqual([]);
    expect(fetch.calls).toHaveLength(1);
  });

  test("maps seniority strings to Lusha IDs in the search body", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [] } }]);
    await searchLeadsBasic(
      { seniorities: ["director", "c-suite", "manager"], locations: ["India"] },
      { fetch }
    );
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.contacts.include.seniority).toEqual(expect.arrayContaining([6, 9, 5]));
  });

  test("maps companySizes to Lusha size ranges in the search body", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [] } }]);
    await searchLeadsBasic(
      { departments: ["Engineering & Technical"], companySizes: ["51-200", "201-500"] },
      { fetch }
    );
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.companies.include.sizes).toEqual(
      expect.arrayContaining([{ min: 51, max: 200 }, { min: 201, max: 500 }])
    );
  });

  test("always includes work_email in existing_data_points", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [] } }]);
    await searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch });
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.contacts.include.existing_data_points).toContain("work_email");
  });

  test("retries on 429 with exponential backoff", async () => {
    const fetch = makeFetch([
      { status: 429, body: { error: "rate_limited" } },
      { status: 200, body: { requestId: "r", data: [] } }
    ]);
    const result = await searchLeadsBasic(
      { departments: ["Engineering & Technical"] },
      { fetch, retryDelayMs: 1 }
    );
    expect(result).toEqual([]);
    expect(fetch.calls).toHaveLength(2);
  });

  test("throws on non-429 search failure", async () => {
    const fetch = makeFetch([{ status: 403, body: { message: "forbidden" } }]);
    await expect(searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch }))
      .rejects.toThrow(/lusha_search_failed_403/);
  });
});

describe("enrichLeads", () => {
  test("calls /contact/enrich with requestId and contactIds, returns normalized enriched leads", async () => {
    const fetch = makeFetch([{ status: 200, body: ENRICH_RESPONSE }]);

    const result = await enrichLeads("req-123", ["contact-uuid-1"], { fetch });

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toMatch(/contact\/enrich/);

    const body = JSON.parse(fetch.calls[0].init.body);
    expect(body.requestId).toBe("req-123");
    expect(body.contactIds).toContain("contact-uuid-1");

    expect(result).toHaveLength(1);
    expect(result[0].lushaContactId).toBe("contact-uuid-1");
    expect(result[0].email).toBe("alice@acme.com");
    expect(result[0].phone).toBe("+911234567890");
    expect(result[0].linkedinUrl).toBe("https://linkedin.com/in/alice");
    expect(result[0].location).toBe("India");
    expect(result[0].department).toBe("Engineering & Technical");
    expect(result[0].seniority).toBe("director");
  });

  test("filters out contacts where isSuccess is false", async () => {
    const fetch = makeFetch([{
      status: 200,
      body: {
        contacts: [
          {
            id: "c1", isSuccess: true,
            data: {
              firstName: "Alice", lastName: "Smith", jobTitle: "CTO", companyName: "Acme",
              emailAddresses: [{ email: "a@acme.com", emailType: "work" }]
            }
          },
          { id: "c2", isSuccess: false, data: {} }
        ]
      }
    }]);

    const result = await enrichLeads("req-x", ["c1", "c2"], { fetch });
    expect(result).toHaveLength(1);
    expect(result[0].lushaContactId).toBe("c1");
  });

  test("returns empty array when all contacts fail enrichment", async () => {
    const fetch = makeFetch([{
      status: 200,
      body: { contacts: [{ id: "c1", isSuccess: false, data: {} }] }
    }]);
    const result = await enrichLeads("req-x", ["c1"], { fetch });
    expect(result).toEqual([]);
  });

  test("throws on enrich API failure", async () => {
    const fetch = makeFetch([{ status: 402, body: { message: "insufficient credits" } }]);
    await expect(enrichLeads("req-x", ["c1"], { fetch }))
      .rejects.toThrow(/lusha_enrich_failed_402/);
  });
});
