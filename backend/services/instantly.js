import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

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
    throw new Error(`instantly_${method}_${path}_${res.status}: ${detail}`);
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

export async function sendSubsequence(instantlyCampaignId, leadEmail, body, opts = {}) {
  await req(`/api/v2/campaigns/${instantlyCampaignId}/subsequences`, "POST", {
    lead_email: leadEmail,
    body
  }, opts);
}

export async function getRecentReplies(instantlyCampaignId, sinceDate, opts = {}) {
  const params = new URLSearchParams({
    campaign_id: instantlyCampaignId,
    type: "REPLY",
    limit: "100"
  });
  const data = await req(`/api/v2/emails?${params}`, "GET", null, opts);
  const items = data?.items ?? data ?? [];
  const since = new Date(sinceDate).getTime();
  return items.filter((m) => {
    const t = new Date(m.created_at ?? m.timestamp ?? m.receivedAt ?? 0).getTime();
    return t >= since;
  });
}
