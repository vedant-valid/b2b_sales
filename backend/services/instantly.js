import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middleware/errorHandler.js";

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
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    const msg = `Instantly API error ${res.status} on ${method} ${path}: ${detail}`;
    throw new HttpError(res.status >= 500 ? 502 : res.status, "instantly_error", msg);
  }
  return res.json();
}

export async function createCampaign(name, opts = {}) {
  const { mode, fetch: fetchFn, ...restOpts } = opts;
  const sendingAccounts = env.INSTANTLY_SENDING_ACCOUNTS
    ? env.INSTANTLY_SENDING_ACCOUNTS.split(",").map(s => s.trim()).filter(Boolean)
    : undefined;

  // TEST campaigns use a 24/7 schedule so demo emails go out immediately
  const schedule = mode === "TEST"
    ? { name: "Default", timing: { from: "00:00", to: "23:59" }, days: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true }, timezone: "Asia/Kolkata" }
    : { name: "Default", timing: { from: "09:00", to: "18:00" }, days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }, timezone: "Asia/Kolkata" };

  const json = await req("/api/v2/campaigns", "POST", {
    name,
    allow_risky_contacts: true,
    ...(sendingAccounts?.length && { email_list: sendingAccounts }),
    campaign_schedule: { schedules: [schedule] },
    sequences: [{
      steps: [{
        type: "email",
        delay: 0,
        delay_unit: "minutes",
        variants: [{ subject: "{{outreach_subject}}", body: "{{personalization}}" }]
      }]
    }]
  }, { fetch: fetchFn });
  const instantlyCampaignId = json.id;

  return { instantlyCampaignId };
}

export async function pushLeads(instantlyCampaignId, leads, opts = {}) {
  const devMode = env.DEV_MODE === "true";
  const testEmail = env.DEV_EMAIL || "madnevedant15@gmail.com";

  const rejected = [];
  for (const l of leads) {
    const recipientEmail = devMode ? testEmail : l.email;
    try {
      await req("/api/v2/leads", "POST", {
        email: recipientEmail,
        campaign: instantlyCampaignId,
        first_name: l.firstName,
        last_name: l.lastName,
        company_name: l.company,
        personalization: l.body,
        custom_variables: { outreach_subject: l.subject }
      }, opts);
      if (devMode) logger.info(`instantly: dev mode — redirected ${l.email} → ${testEmail}`);
    } catch (err) {
      logger.error(`instantly: failed to push lead ${l.email}: ${err.message}`);
      rejected.push({ email: l.email });
    }
  }
  return { accepted: leads.length - rejected.length, rejected };
}

export async function activateCampaign(instantlyCampaignId, opts = {}) {
  await req(`/api/v2/campaigns/${instantlyCampaignId}/activate`, "POST", {}, opts);
}

export async function lookupInstantlyLeadId(instantlyCampaignId, email, opts = {}) {
  const devMode = env.DEV_MODE === "true";
  const lookupEmail = devMode ? (env.DEV_EMAIL || "madnevedant15@gmail.com") : email;
  const data = await req("/api/v2/leads/list", "POST", { search: lookupEmail, campaign: instantlyCampaignId, limit: 1 }, opts);
  const lead = data?.items?.[0];
  if (!lead) throw new HttpError(404, "instantly_lead_not_found", `Lead ${lookupEmail} not found in Instantly campaign ${instantlyCampaignId}`);
  return lead.id;
}

export async function createFollowUpSubsequence(instantlyCampaignId, subject, body, opts = {}) {
  const schedule = { name: "Default", timing: { from: "00:00", to: "23:59" }, days: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true }, timezone: "Asia/Kolkata" };
  const json = await req("/api/v2/subsequences", "POST", {
    parent_campaign: instantlyCampaignId,
    name: `Follow-up ${new Date().toISOString()}`,
    conditions: { crm_status: [], lead_activity: [], reply_contains: "" },
    subsequence_schedule: { start_date: null, end_date: null, schedules: [schedule] },
    sequences: [{ steps: [{ type: "email", delay: 0, delay_unit: "minutes", pre_delay: 0, pre_delay_unit: "minutes", variants: [{ subject, body }] }] }]
  }, opts);
  return json.id;
}

export async function moveLeadToSubsequence(instantlyLeadId, subsequenceId, opts = {}) {
  await req("/api/v2/leads/subsequence/move", "POST", {
    id: instantlyLeadId,
    subsequence_id: subsequenceId
  }, opts);
}

export async function getRecentReplies(instantlyCampaignId, sinceDate, opts = {}) {
  const params = new URLSearchParams({
    campaign_id: instantlyCampaignId,
    email_type: "received",
    min_timestamp_created: sinceDate,
    limit: "100"
  });
  const data = await req(`/api/v2/emails?${params}`, "GET", null, opts);
  return data?.items ?? [];
}
