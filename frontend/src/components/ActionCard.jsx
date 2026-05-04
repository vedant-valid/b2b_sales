export default function ActionCard({ campaign, leads, skippedIds, unlocking, acting, unlockError, onUnlockLeads, onAction }) {
  const { status } = campaign;
  const selectedCount = leads.filter(l => !skippedIds.has(l.id)).length;
  const totalLeads = leads.length;

  if (status === "AWAITING_LEAD_SELECTION") {
    return (
      <div className="border border-purple-300 bg-purple-50 rounded-lg p-5 space-y-3">
        <div>
          <p className="font-semibold text-purple-900 text-base">
            {totalLeads} lead{totalLeads !== 1 ? "s" : ""} found — review and select the ones you want to contact
          </p>
          <p className="text-sm text-purple-700 mt-1">
            Unlocking costs 1 credit per lead. Credits are only charged after you confirm.
          </p>
        </div>
        {unlockError && <p className="text-sm text-red-600">{unlockError}</p>}
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={onUnlockLeads}
            disabled={unlocking || selectedCount === 0}
            className="bg-purple-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
          >
            {unlocking ? "Unlocking…" : `Unlock ${selectedCount} lead${selectedCount !== 1 ? "s" : ""} — ${selectedCount} credit${selectedCount !== 1 ? "s" : ""}`}
          </button>
          <button
            onClick={() => onAction("reject-leads")}
            disabled={acting}
            className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Discard all &amp; start over
          </button>
        </div>
      </div>
    );
  }

  if (status === "AWAITING_LEAD_APPROVAL") {
    const approveCount = totalLeads - skippedIds.size;
    return (
      <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-5 space-y-3">
        <p className="font-semibold text-yellow-900 text-base">
          {totalLeads} lead{totalLeads !== 1 ? "s" : ""} ready — skip any you don&apos;t want, then approve the rest
        </p>
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={() => onAction("approve-leads")}
            disabled={acting || approveCount === 0}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
          >
            Approve {approveCount} lead{approveCount !== 1 ? "s" : ""} — generate emails
          </button>
          <button
            onClick={() => onAction("reject-leads")}
            disabled={acting}
            className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Reject all
          </button>
        </div>
      </div>
    );
  }

  if (status === "AWAITING_EMAIL_APPROVAL") {
    return (
      <div className="border border-blue-300 bg-blue-50 rounded-lg p-5 space-y-3">
        <div>
          <p className="font-semibold text-blue-900 text-base">
            Emails drafted — review them below, then push to Instantly
          </p>
          <p className="text-sm text-blue-700 mt-1">
            Clicking &ldquo;Push to Instantly&rdquo; will upload all leads and emails to Instantly and activate the campaign. Emails will be sent according to your Instantly schedule.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={() => onAction("approve-emails")}
            disabled={acting}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
          >
            Push to Instantly →
          </button>
          <button
            onClick={() => onAction("reject-emails")}
            disabled={acting}
            className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Reject — start over
          </button>
        </div>
      </div>
    );
  }

  if (status === "RUNNING" || status === "READY_FOR_OUTREACH") {
    return (
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-5">
        <p className="font-semibold text-blue-900 text-base">Campaign is running — emails are being sent</p>
        <p className="text-sm text-blue-700 mt-1">Replies will appear automatically in the Replies tab when leads respond.</p>
      </div>
    );
  }

  if (status === "COMPLETED") {
    const contacted = leads.filter(l => l.status === "CONTACTED").length;
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-5">
        <p className="font-semibold text-green-900 text-base">Campaign complete</p>
        <p className="text-sm text-green-700 mt-1">
          {contacted} lead{contacted !== 1 ? "s" : ""} contacted.{" "}
          <a href="/replies" className="underline">Check the Replies page</a> for responses.
        </p>
      </div>
    );
  }

  return null;
}
