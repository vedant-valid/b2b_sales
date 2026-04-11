"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import EmailDraftPanel from "@/components/EmailDraftPanel";

export default function LeadDetailPage({ params }) {
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);

  const load = useCallback(async () => {
    if (!session?.backendToken) return;
    const { lead } = await apiFetch(`/api/leads/${params.id}`, { token: session.backendToken });
    setLead(lead);
  }, [session?.backendToken, params.id]);

  useEffect(() => { load(); }, [load]);

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
