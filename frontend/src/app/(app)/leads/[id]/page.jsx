"use client";
import { use, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import EmailDraftPanel from "@/components/EmailDraftPanel";

export default function LeadDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);

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

  if (error) return <p className="text-red-600 text-sm">Could not load lead: {error}</p>;
  if (!lead) return <p>Loading...</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
        <p className="text-sm text-gray-600">{lead.title} · {lead.company}</p>
        <p className="text-sm">{lead.email}</p>
        <p className="text-sm">Status: <span className="font-semibold">{lead.status}</span></p>
      </div>
      <EmailDraftPanel leadId={lead.id} emails={lead.emails || []} onRefresh={load} />
    </div>
  );
}
