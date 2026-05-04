"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import LeadTable from "@/components/LeadTable";

export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState([]);
  const [tab, setTab] = useState("active");

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/leads", { token: session.backendToken })
      .then(({ leads }) => setLeads(leads))
      .catch((err) => { if (err.status === 401) signOut({ callbackUrl: "/login" }); });
  }, [session?.backendToken]);

  function onStatusChange(id, newStatus) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
  }

  const outreachLeads = leads.filter((l) => l.campaign?.mode !== "TEST");
  const testLeads     = leads.filter((l) => l.campaign?.mode === "TEST");

  const activeOutreach    = outreachLeads.filter((l) => l.status !== "SKIPPED");
  const irrelevantOutreach = outreachLeads.filter((l) => l.status === "SKIPPED");
  const activeTest        = testLeads.filter((l) => l.status !== "SKIPPED");
  const irrelevantTest    = testLeads.filter((l) => l.status === "SKIPPED");

  const totalActive    = activeOutreach.length + activeTest.length;
  const totalIrrelevant = irrelevantOutreach.length + irrelevantTest.length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Leads</h1>

      {/* Tab bar */}
      <div className="flex gap-0 border-b">
        <TabButton label="Active" count={totalActive} active={tab === "active"} onClick={() => setTab("active")} countCls="bg-gray-100 text-gray-600" />
        <TabButton label="Irrelevant" count={totalIrrelevant} active={tab === "irrelevant"} onClick={() => setTab("irrelevant")} countCls="bg-orange-100 text-orange-600" />
      </div>

      {tab === "active" && (
        <div className="space-y-8">
          <Section title="Outreach" count={activeOutreach.length} countCls="bg-gray-100 text-gray-600" empty="No outreach leads yet.">
            {activeOutreach.length > 0 && (
              <LeadTable leads={activeOutreach} token={session?.backendToken} onStatusChange={onStatusChange} />
            )}
          </Section>
          <Section title="Demo / Testing" count={activeTest.length} countCls="bg-amber-100 text-amber-700" empty="No test leads yet.">
            {activeTest.length > 0 && (
              <LeadTable leads={activeTest} token={session?.backendToken} onStatusChange={onStatusChange} />
            )}
          </Section>
        </div>
      )}

      {tab === "irrelevant" && (
        <div>
          {totalIrrelevant === 0 ? (
            <p className="text-sm text-gray-400">No leads marked as irrelevant yet.</p>
          ) : (
            <LeadTable leads={[...irrelevantOutreach, ...irrelevantTest]} token={session?.backendToken} onStatusChange={onStatusChange} />
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ label, count, active, onClick, countCls }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}{" "}
      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${countCls}`}>{count}</span>
    </button>
  );
}

function Section({ title, count, countCls, empty, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${countCls}`}>{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-gray-400">{empty}</p> : children}
    </section>
  );
}
