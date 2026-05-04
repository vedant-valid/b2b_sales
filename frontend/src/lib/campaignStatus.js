export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: "Draft",
  RUNNING: "Running…",
  AWAITING_LEAD_SELECTION: "Review Leads",
  AWAITING_LEAD_APPROVAL: "Approve Leads",
  AWAITING_EMAIL_APPROVAL: "Ready to Push",
  READY_FOR_OUTREACH: "Sending…",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

export const CAMPAIGN_STATUS_NEEDS_ACTION = new Set([
  "AWAITING_LEAD_SELECTION",
  "AWAITING_LEAD_APPROVAL",
  "AWAITING_EMAIL_APPROVAL",
]);

export function campaignStatusLabel(status) {
  return CAMPAIGN_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function campaignStatusNeedsAction(status) {
  return CAMPAIGN_STATUS_NEEDS_ACTION.has(status);
}
