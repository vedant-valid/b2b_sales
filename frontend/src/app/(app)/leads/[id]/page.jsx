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

  const isViewer = session?.user?.role === "VIEWER";

  const load = useCallback(async () => {
    if (!session?.backendToken) return;
    try {
      const { lead } = await apiFetch(`/api/leads/${id}`, { token: session.backendToken });
      setLead(lead);
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
      <EmailDraftPanel leadId={lead.id} emails={lead.emails || []} onRefresh={load} />
    </div>
  );
}
