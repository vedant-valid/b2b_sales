import { env } from "../config/env.js";

const BASE = "https://api.instantly.ai";

function headers() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${env.INSTANTLY_API_KEY || "test-key"}`
  };
}

async function req(path, method, body, { fetch: fetchFn = globalThis.fetch } = {}) {
  const res = await fetchFn(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`instantly_${method}_${path}_${res.status}`);
  return res.json();
}

export async function createCampaign(name, opts = {}) {
  const json = await req("/api/v2/campaigns", "POST", { name }, opts);
  return { instantlyCampaignId: json.id };
}

export async function pushLeads(instantlyCampaignId, leads, opts = {}) {
  const payload = {
    campaign_id: instantlyCampaignId,
    leads: leads.map((l) => ({
      email: l.email,
      first_name: l.firstName,
      last_name: l.lastName,
      company_name: l.company,
      personalization: l.body,
      custom_variables: { subject: l.subject, body: l.body }
    }))
  };
  const json = await req("/api/v2/leads", "POST", payload, opts);
  return { accepted: json.accepted || 0, rejected: json.rejected || [] };
}

export async function sendSubsequence(instantlyCampaignId, leadEmail, body, opts = {}) {
  await req(`/api/v2/campaigns/${instantlyCampaignId}/subsequences`, "POST", {
    lead_email: leadEmail,
    body
  }, opts);
}
