"use client";
import { use, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import EmailDraftPanel from "@/components/EmailDraftPanel";
import LeadStatusBadge from "@/components/LeadStatusBadge";

const ALL_STATUSES = [
  "NEW", "CONTACTED", "REPLIED",
  "INTERESTED", "NOT_INTERESTED", "NEUTRAL",
  "CONVERTIBLE", "SKIPPED",
];

const STATUS_LABELS = {
  NEW: "New",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  NEUTRAL: "Neutral",
  CONVERTIBLE: "Convertible",
  SKIPPED: "Irrelevant",
};

export default function LeadDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesBusy, setNotesBusy] = useState(false);

  const isViewer = session?.user?.role === "VIEWER";

  const load = useCallback(async () => {
    if (!session?.backendToken) return;
    try {
      const { lead } = await apiFetch(`/api/leads/${id}`, { token: session.backendToken });
      setLead(lead);
      setNotes(lead.notes ?? "");
    } catch (e) {
      setError(e.data?.error || e.message);
    }
  }, [session?.backendToken, id]);

  useEffect(() => { load(); }, [load]);

  async function onStatusChange(e) {
    const newStatus = e.target.value;
    setStatusBusy(true);
    setStatusError("");
    const prev = lead.status;
    setLead((l) => ({ ...l, status: newStatus }));
    try {
      await apiFetch(`/api/leads/${id}`, {
        token: session?.backendToken,
        method: "PATCH",
        body: { status: newStatus },
      });
    } catch {
      setLead((l) => ({ ...l, status: prev }));
      setStatusError("Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveNotes() {
    if (isViewer) return;
    setNotesBusy(true);
    setNotesSaved(false);
    try {
      await apiFetch(`/api/leads/${id}`, {
        token: session?.backendToken,
        method: "PATCH",
        body: { notes },
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setNotesBusy(false);
    }
  }

  if (error) return <p className="text-red-600 text-sm">Could not load lead: {error}</p>;
  if (!lead) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
        <p className="text-sm text-gray-600">{lead.title} · {lead.company}</p>
        <p className="text-sm">{lead.email}</p>
        <div className="flex items-center gap-3">
          <LeadStatusBadge status={lead.status} />
          {!isViewer && (
            <select
              value={lead.status}
              onChange={onStatusChange}
              disabled={statusBusy}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}
          {statusError && <span className="text-xs text-red-500">{statusError}</span>}
        </div>
      </div>

      {lead.aiSummary && (
        <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">AI Summary</p>
          <p className="text-sm text-blue-900">{lead.aiSummary}</p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-semibold">Notes &amp; Action Items</label>
        {isViewer ? (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{notes || <span className="text-gray-400">No notes.</span>}</p>
        ) : (
          <div className="space-y-1">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder={"Add notes, action items, follow-up reminders…\n- Call back next week\n- Check LinkedIn"}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500 resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveNotes}
                disabled={notesBusy}
                className="text-xs bg-black text-white px-3 py-1 rounded disabled:opacity-40"
              >
                {notesBusy ? "Saving…" : "Save"}
              </button>
              {notesSaved && <span className="text-xs text-green-600">Saved</span>}
            </div>
          </div>
        )}
      </div>

      <EmailDraftPanel leadId={lead.id} emails={lead.emails || []} onRefresh={load} />
    </div>
  );
}
