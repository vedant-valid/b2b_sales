"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import LeadTable from "@/components/LeadTable";

export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/leads", { token: session.backendToken })
      .then(({ leads }) => setLeads(leads))
      .catch((err) => { if (err.status === 401) signOut({ callbackUrl: "/login" }); });
  }, [session?.backendToken]);

  const outreachLeads = leads.filter((l) => l.campaign?.mode !== "TEST");
  const testLeads = leads.filter((l) => l.campaign?.mode === "TEST");

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Leads</h1>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Outreach</h2>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{outreachLeads.length}</span>
        </div>
        {outreachLeads.length === 0
          ? <p className="text-sm text-gray-400">No outreach leads yet.</p>
          : <LeadTable leads={outreachLeads} />}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Demo / Testing</h2>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{testLeads.length}</span>
        </div>
        {testLeads.length === 0
          ? <p className="text-sm text-gray-400">No test leads yet.</p>
          : <LeadTable leads={testLeads} />}
      </section>
    </div>
  );
}
