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

function normalize(p) {
  return {
    lushaPersonId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.jobTitle,
    company: p.companyName,
    location: p.location?.country || p.location?.city || null,
    linkedinUrl: p.linkedinUrl,
    department: p.department,
    seniority: p.seniority
  };
}

export async function searchLeads(filters, opts = {}) {
  const res = await requestWithRetry(`${BASE}/prospecting/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ filters, pages: { page: 0, size: 50 } })
  }, opts);
  if (!res.ok) throw new Error(`lusha_search_failed_${res.status}`);
  const json = await res.json();
  return (json.data || []).map(normalize);
}

export async function enrichContact(lushaPersonId, opts = {}) {
  const res = await requestWithRetry(`${BASE}/prospecting/contact/${lushaPersonId}`, {
    method: "GET",
    headers: headers()
  }, opts);
  if (!res.ok) throw new Error(`lusha_enrich_failed_${res.status}`);
  const json = await res.json();
  return { email: json.data?.email || null, phone: json.data?.phoneNumber || null };
}
