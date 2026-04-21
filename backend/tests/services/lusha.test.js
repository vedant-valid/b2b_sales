import { jest } from "@jest/globals";
import { searchLeads } from "../../services/lusha.js";

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

describe("lusha service", () => {
  test("searchLeads does search then enrich, returns normalized leads", async () => {
    const fetch = makeFetch([
      { status: 200, body: SEARCH_RESPONSE },
      { status: 200, body: ENRICH_RESPONSE }
    ]);
    const leads = await searchLeads(
      { seniorities: ["director"], departments: ["Engineering & Technical"], locations: ["India"] },
      { fetch }
    );

    expect(leads).toHaveLength(1);
    expect(leads[0].firstName).toBe("Alice");
    expect(leads[0].lastName).toBe("Smith");
    expect(leads[0].lushaContactId).toBe("contact-uuid-1");
    expect(leads[0].email).toBe("alice@acme.com");
    expect(leads[0].title).toBe("Head of Engineering");
    expect(leads[0].company).toBe("Acme");
    expect(leads[0].location).toBe("India");
    expect(leads[0].linkedinUrl).toBe("https://linkedin.com/in/alice");

    // First call is search, second is enrich
    expect(fetch.calls[0].url).toMatch(/contact\/search/);
    expect(fetch.calls[1].url).toMatch(/contact\/enrich/);

    // Verify enrich was called with requestId and contactIds from search
    const enrichBody = JSON.parse(fetch.calls[1].init.body);
    expect(enrichBody.requestId).toBe("req-123");
    expect(enrichBody.contactIds).toContain("contact-uuid-1");
  });

  test("maps seniority strings to Lusha IDs in the search body", async () => {
    const fetch = makeFetch([
      { status: 200, body: { requestId: "r", data: [] } }
    ]);
    await searchLeads(
      { seniorities: ["director", "c-suite", "manager"], locations: ["India"] },
      { fetch }
    );
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.contacts.include.seniority).toEqual(expect.arrayContaining([6, 9, 5]));
  });

  test("maps companySizes to Lusha size ranges in the search body", async () => {
    const fetch = makeFetch([
      { status: 200, body: { requestId: "r", data: [] } }
    ]);
    await searchLeads(
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
    await searchLeads({ departments: ["Engineering & Technical"] }, { fetch });
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.contacts.include.existing_data_points).toContain("work_email");
  });

  test("returns empty array when search returns no contacts", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [], totalResults: 0 } }]);
    const leads = await searchLeads({ departments: ["Engineering & Technical"] }, { fetch });
    expect(leads).toEqual([]);
    // Should not call enrich when there are no contacts
    expect(fetch.calls).toHaveLength(1);
  });

  test("retries search on 429 with backoff", async () => {
    const fetch = makeFetch([
      { status: 429, body: { error: "rate_limited" } },
      { status: 200, body: { requestId: "r", data: [] } }
    ]);
    const leads = await searchLeads({ departments: ["Engineering & Technical"] }, { fetch, retryDelayMs: 1 });
    expect(leads).toEqual([]);
    expect(fetch.calls).toHaveLength(2);
  });

  test("throws on non-429 search failure", async () => {
    const fetch = makeFetch([{ status: 403, body: { message: "forbidden" } }]);
    await expect(searchLeads({ departments: ["Engineering & Technical"] }, { fetch }))
      .rejects.toThrow(/lusha_search_failed_403/);
  });
});
