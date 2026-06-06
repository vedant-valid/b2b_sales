"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import LeadList from "@/components/unibox/LeadList";
import ThreadPanel from "@/components/unibox/ThreadPanel";

export default function UniboxPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/leads?hasSentEmail=true", { token: session.backendToken })
      .then(({ leads }) => setLeads(leads))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.backendToken]);

  const selectedLead = leads.find(l => l.id === selectedId) ?? null;

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  if (leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No emails sent yet. Run a campaign first.
      </div>
    );
  }

  return (
    <div className="flex border rounded overflow-hidden" style={{ height: "calc(100vh - 120px)" }}>
      <LeadList
        leads={leads}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <ThreadPanel lead={selectedLead} />
    </div>
  );
}
