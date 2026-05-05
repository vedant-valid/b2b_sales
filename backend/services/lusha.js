import { env } from "../config/env.js";

const BASE = "https://api.lusha.com";

function headers() {
  return {
    "Content-Type": "application/json",
    "api_key": env.LUSHA_API_KEY || "test-key"
  };
}

async function requestWithRetry(url, init, { retries = 3, retryDelayMs = 1000, fetch: fetchFn = globalThis.fetch } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchFn(url, init);
    if (res.status !== 429) return res;
    if (attempt === retries) return res;
    const wait = retryDelayMs * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, wait));
  }
}

// Lusha seniority IDs (from GET /prospecting/filters/contacts/seniority)
const SENIORITY_IDS = {
  "founder": 10, "partner": 7,
  "c-suite": 9, "c suite": 9, "csuite": 9, "c-level": 9, "c level": 9, "executive": 9,
  "vice president": 8, "vp": 8,
  "director": 6,
  "manager": 5,
  "senior": 4,
  "entry": 3,
  "intern": 2,
  "other": 1
};

// Lusha company size ranges (from GET /prospecting/filters/companies/sizes)
const SIZE_RANGES = {
  "1-10": { min: 1, max: 10 },
  "11-50": { min: 11, max: 50 },
  "51-200": { min: 51, max: 200 },
  "201-500": { min: 201, max: 500 },
  "501-1000": { min: 501, max: 1000 },
  "1001-5000": { min: 1001, max: 5000 },
  "5001-10000": { min: 5001, max: 10000 },
  "10001+": { min: 10001 },
  "startup": { min: 1, max: 200 },
  "small": { min: 1, max: 200 },
  "medium": { min: 201, max: 1000 },
  "large": { min: 1001, max: 10000 },
  "enterprise": { min: 10001 },
  "unicorn": { min: 1001, max: 10000 }
};

function buildLushaBody(geminiFilters, page = 0, size = 25) {
  const contactsInclude = {};
  const companiesInclude = {};
  const companiesExclude = {};

  if (geminiFilters.departments?.length) {
    contactsInclude.departments = geminiFilters.departments;
  }

  if (geminiFilters.seniorities?.length) {
    const ids = [...new Set(
      geminiFilters.seniorities
        .map(s => SENIORITY_IDS[s.toLowerCase()])
        .filter(Boolean)
    )];
    if (ids.length) contactsInclude.seniority = ids;
  }

  if (geminiFilters.locations?.length) {
    contactsInclude.locations = geminiFilters.locations.map(l => ({ country: l }));
    companiesInclude.locations = geminiFilters.locations.map(l => ({ country: l }));
  }

  // Always require work email so we can contact them
  contactsInclude.existing_data_points = ["work_email"];

  if (geminiFilters.companySizes?.length) {
    const sizes = geminiFilters.companySizes
      .map(s => SIZE_RANGES[s.toLowerCase()] || null)
      .filter(Boolean);
    if (sizes.length) companiesInclude.sizes = sizes;
  }

  if (geminiFilters.excludeIndustries?.length) {
    companiesExclude.industries = geminiFilters.excludeIndustries;
  }

  return {
    pages: { page, size },
    filters: {
      contacts: { include: contactsInclude },
      companies: {
        include: companiesInclude,
        ...(Object.keys(companiesExclude).length ? { exclude: companiesExclude } : {})
      }
    }
  };
}

function normalizeName(fullName = "") {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}

function normalizeEnriched(contact) {
  const d = contact.data || {};
  const emailEntry = (d.emailAddresses || []).find(e => e.emailType === "work") || d.emailAddresses?.[0];
  const rawEmail = emailEntry?.email || null;
  return {
    lushaContactId: contact.id,
    firstName: d.firstName || "",
    lastName: d.lastName || "",
    email: rawEmail && !rawEmail.startsWith("...") ? rawEmail : null,
    phone: d.phoneNumbers?.[0]?.number || null,
    title: d.jobTitle || null,
    company: d.companyName || null,
    location: d.location?.country || null,
    linkedinUrl: d.socialLinks?.linkedin || null,
    department: d.departments?.[0] || null,
    seniority: (Array.isArray(d.seniority)
      ? (d.seniority[0]?.name || d.seniority[0] || null)
      : (d.seniority || null))
  };
}

/**
 * Phase 1 — free. Calls /contact/search only. No credits consumed.
 * Returns basic lead info + requestId (needed to call enrichLeads later).
 */
export async function searchLeadsBasic(geminiFilters, opts = {}) {
  const body = buildLushaBody(geminiFilters, 0, 25);

  const res = await requestWithRetry(`${BASE}/prospecting/contact/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  }, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`lusha_search_failed_${res.status}: ${err.message || ""}`);
  }

  const json = await res.json();
  const requestId = json.requestId;
  const rawContacts = json.data || [];

  return rawContacts.map(c => {
    const { firstName, lastName } = normalizeName(c.name);
    return {
      lushaContactId: c.contactId,
      firstName,
      lastName,
      title: c.jobTitle || null,
      company: c.companyName || null,
      requestId
    };
  });
}

/**
 * Phase 2 — paid. Calls /contact/enrich. Credits consumed here only.
 * requestId must be the one returned by the search that found these contacts.
 * Returns fully enriched lead objects (email, phone, etc.).
 */
export async function enrichLeads(requestId, contactIds, opts = {}) {
  const res = await requestWithRetry(`${BASE}/prospecting/contact/enrich`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ requestId, contactIds })
  }, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`lusha_enrich_failed_${res.status}: ${err.message || ""}`);
  }

  const json = await res.json();
  const enriched = (json.contacts || []).filter(c => c.isSuccess);
  return enriched.map(normalizeEnriched);
}
