"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function LeadDetailPage({ params }) {
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/leads/${params.id}`, { token: session.backendToken }).then(({ lead }) => setLead(lead));
  }, [session?.backendToken, params.id]);

  if (!lead) return <p>Loading...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
      <p className="text-sm">{lead.title} · {lead.company}</p>
      <p className="text-sm">{lead.email}</p>
      <p className="text-sm">Status: {lead.status}</p>
    </div>
  );
}
