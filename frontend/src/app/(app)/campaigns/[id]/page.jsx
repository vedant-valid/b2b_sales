"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";
import EmailTemplatePanel from "@/components/EmailTemplatePanel";
import JobProgressBar from "@/components/JobProgressBar";
import LeadApprovalTable from "@/components/LeadApprovalTable";
import Link from "next/link";
import LeadTable from "@/components/LeadTable";
import StepBar from "@/components/StepBar";
import ActionCard from "@/components/ActionCard";
import FilterEditor from "@/components/FilterEditor";
import { campaignStatusLabel } from "@/lib/campaignStatus";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function CampaignDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [skippedIds, setSkippedIds] = useState(new Set());
  const [rowError, setRowError] = useState({});
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [addingTestLead, setAddingTestLead] = useState(false);
  const [testLeadError, setTestLeadError] = useState("");
  const [leadTab, setLeadTab] = useState("active");
  const [editingFilters, setEditingFilters] = useState(false);
  const [filterDraft, setFilterDraft] = useState("");
  const [filterError, setFilterError] = useState("");
  const [rerunning, setRerunning] = useState(false);

  const loadCampaign = useCallback(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign))
      .catch((e) => setError(e.message));
  }, [session?.backendToken, id]);

  const loadLeads = useCallback(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/leads?campaignId=${id}`, { token: session.backendToken })
      .then(({ leads }) => setLeads(leads || []))
      .catch(() => {});
  }, [session?.backendToken, id]);

  useEffect(() => {
    loadCampaign();
    loadLeads();
  }, [loadCampaign, loadLeads]);

  async function onRun() {
    setError("");
    try {
      const { jobId } = await apiFetch(`/api/campaigns/${id}/run`, {
        token: session.backendToken, method: "POST"
      });
      setJobId(jobId);
    } catch (e) { setError(e.message); }
  }

  async function onAction(gate) {
    setActing(true);
    setError("");
    try {
      const body = gate === "approve-leads"
        ? { approvedIds: leads.filter(l => !skippedIds.has(l.id)).map(l => l.id) }
        : undefined;
      await apiFetch(`/api/campaigns/${id}/${gate}`, {
        token: session.backendToken, method: "POST", body
      });
      setSkippedIds(new Set());
      loadCampaign();
      loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  async function onAddTestLead(e) {
    e.preventDefault();
    if (!testEmail) return;
    setAddingTestLead(true);
    setTestLeadError("");
    try {
      await apiFetch(`/api/campaigns/${id}/add-test-lead`, {
        token: session.backendToken, method: "POST", body: { email: testEmail }
      });
      setTestEmail("");
      loadLeads();
    } catch (e) {
      setTestLeadError(e.data?.error === "email_already_in_campaign" ? "Already added" : e.message);
    } finally { setAddingTestLead(false); }
  }

  function onSkip(leadId) {
    setSkippedIds(prev => new Set([...prev, leadId]));
  }

  function onUndoSkip(leadId) {
    setSkippedIds(prev => { const n = new Set(prev); n.delete(leadId); return n; });
  }

  function onLeadStatusChange(leadId, newStatus) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
  }

  async function onRerunWithFilters() {
    setFilterError("");
    let filters;
    try { filters = JSON.parse(filterDraft); } catch {
      setFilterError("Invalid JSON — check your syntax.");
      return;
    }
    setRerunning(true);
    try {
      const { jobId: jid } = await apiFetch(`/api/campaigns/${id}/rerun-with-filters`, {
        token: session.backendToken, method: "POST", body: { filters }
      });
      setEditingFilters(false);
      setJobId(jid);
      setLeads([]);
      loadCampaign();
    } catch (e) { setFilterError(e.message); }
    finally { setRerunning(false); }
  }

  async function onUnlockLeads() {
    setUnlocking(true);
    setUnlockError("");
    const selectedIds = leads.filter(l => !skippedIds.has(l.id)).map(l => l.id);
    try {
      await apiFetch(`/api/campaigns/${id}/select-leads`, {
        token: session.backendToken, method: "POST", body: { leadIds: selectedIds }
      });
      await apiFetch(`/api/campaigns/${id}/unlock-leads`, {
        token: session.backendToken, method: "POST"
      });
      setSkippedIds(new Set());
      loadCampaign();
      loadLeads();
    } catch (e) {
      const msg = e.data?.error === "insufficient_credits"
        ? `Not enough credits — need ${e.data.required}, have ${e.data.available}`
        : e.message;
      setUnlockError(msg);
    } finally { setUnlocking(false); }
  }

  async function onSyncStatus() {
    setActing(true);
    setError("");
    try {
      const { updated } = await apiFetch(`/api/campaigns/${id}/sync-lead-status`, {
        token: session.backendToken, method: "POST"
      });
      if (updated > 0) loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  async function onSeedDevLead() {
    setActing(true);
    setError("");
    try {
      await apiFetch(`/api/campaigns/${id}/dev-seed-lead`, {
        token: session.backendToken, method: "POST"
      });
      loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  if (!campaign) return <p>Loading...</p>;

  const isViewer = session?.user?.role === "VIEWER";

  return (
    <div className="space-y-4">
      {campaign.mode === "TEST" && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3 py-2 rounded flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wide">Test Campaign</span>
          <span>— emails use a fixed demo template. Regenerate will also produce demo content, not AI outreach.</span>
        </div>
      )}
      {DEV_MODE && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 text-xs px-3 py-1 rounded font-mono">
          DEV MODE — all outbound emails redirected to madnevedant15@gmail.com
        </div>
      )}

      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold">{campaign.name}</h1>
            <p className="text-sm text-gray-500">{campaignStatusLabel(campaign.status)}</p>
          </div>
          {!isViewer && campaign.status === "DRAFT" && (
            <button onClick={onRun} className="bg-black text-white px-3 py-2 rounded text-sm">
              Run campaign
            </button>
          )}
        </div>
        <StepBar status={campaign.status} />
      </div>

      <div>
        <h2 className="font-semibold mb-1">Raw goal</h2>
        <p className="text-sm">{campaign.rawGoal}</p>
      </div>
      <div>
        <h2 className="font-semibold mb-1">Extracted filters</h2>
        <FilterPreview filters={campaign.extractedFilters} />
      </div>

      {!isViewer && (
        <EmailTemplatePanel
          campaignId={id}
          token={session?.backendToken}
        />
      )}

      {!isViewer && (
        <ActionCard
          campaign={campaign}
          leads={leads}
          skippedIds={skippedIds}
          unlocking={unlocking}
          acting={acting}
          unlockError={unlockError}
          onUnlockLeads={onUnlockLeads}
          onAction={onAction}
        />
      )}

      {["AWAITING_LEAD_SELECTION", "AWAITING_LEAD_APPROVAL"].includes(campaign.status) && leads.length > 0 && (
        <LeadApprovalTable
          leads={leads}
          skippedIds={skippedIds}
          onSkip={onSkip}
          onUndoSkip={onUndoSkip}
          rowError={rowError}
        />
      )}

      {campaign.status === "AWAITING_LEAD_SELECTION" && !isViewer && (
        <div className="border border-gray-200 rounded-lg p-4">
          <button
            onClick={() => {
              setFilterDraft(JSON.stringify(campaign.extractedFilters, null, 2));
              setFilterError("");
              setEditingFilters(v => !v);
            }}
            className="text-sm text-gray-600 underline"
          >
            {editingFilters ? "Cancel" : "Not happy with these leads? Edit filters and re-run →"}
          </button>
          {editingFilters && (
            <FilterEditor
              initialFilters={campaign.extractedFilters}
              onRerun={async (filters) => {
                setFilterError("");
                setRerunning(true);
                try {
                  const { jobId: jid } = await apiFetch(`/api/campaigns/${id}/rerun-with-filters`, {
                    token: session.backendToken, method: "POST", body: { filters }
                  });
                  setEditingFilters(false);
                  setJobId(jid);
                  setLeads([]);
                  loadCampaign();
                } catch (e) { setFilterError(e.message); }
                finally { setRerunning(false); }
              }}
              rerunning={rerunning}
            />
          )}
          {filterError && <p className="text-xs text-red-600 mt-2">{filterError}</p>}
        </div>
      )}

      {jobId && <JobProgressBar jobId={jobId} onComplete={() => { loadCampaign(); loadLeads(); }} />}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!["AWAITING_LEAD_APPROVAL", "AWAITING_LEAD_SELECTION"].includes(campaign.status) && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Leads</h2>
            <div className="flex gap-2 items-center">
              {campaign.status === "RUNNING" && !isViewer && (
                <button
                  onClick={onSyncStatus}
                  disabled={acting}
                  className="text-xs border border-gray-400 text-gray-700 bg-white px-2 py-1 rounded disabled:opacity-50"
                >
                  Sync Status
                </button>
              )}
              {DEV_MODE && !isViewer && (
                <button
                  onClick={onSeedDevLead}
                  disabled={acting}
                  className="text-xs border border-yellow-500 text-yellow-700 bg-yellow-50 px-2 py-1 rounded disabled:opacity-50"
                >
                  + Add test lead (dev)
                </button>
              )}
            </div>
          </div>

          {leads.length === 0 ? (
            <p className="text-sm text-gray-500">No leads yet.</p>
          ) : (
            <>
              <div className="flex gap-0 border-b">
                {["active", "irrelevant"].map((t) => {
                  const count = t === "active"
                    ? leads.filter((l) => l.status !== "SKIPPED").length
                    : leads.filter((l) => l.status === "SKIPPED").length;
                  const countCls = t === "irrelevant" ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-600";
                  return (
                    <button
                      key={t}
                      onClick={() => setLeadTab(t)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        leadTab === t ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t === "active" ? "Active" : "Irrelevant"}{" "}
                      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${countCls}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {leadTab === "active" && (
                <LeadTable
                  leads={leads.filter((l) => l.status !== "SKIPPED")}
                  token={!isViewer ? session?.backendToken : undefined}
                  onStatusChange={!isViewer ? onLeadStatusChange : undefined}
                />
              )}
              {leadTab === "irrelevant" && (
                leads.filter((l) => l.status === "SKIPPED").length === 0
                  ? <p className="text-sm text-gray-400">No irrelevant leads.</p>
                  : <LeadTable
                      leads={leads.filter((l) => l.status === "SKIPPED")}
                      token={!isViewer ? session?.backendToken : undefined}
                      onStatusChange={!isViewer ? onLeadStatusChange : undefined}
                    />
              )}
            </>
          )}

          {campaign.mode === "TEST" && !isViewer && (
            <form onSubmit={onAddTestLead} className="mt-3 flex items-center gap-2">
              <input
                type="email"
                placeholder="Add test email address…"
                value={testEmail}
                onChange={(e) => { setTestEmail(e.target.value); setTestLeadError(""); }}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:border-gray-500"
              />
              <button
                type="submit"
                disabled={addingTestLead || !testEmail}
                className="text-sm bg-black text-white px-3 py-1.5 rounded disabled:opacity-40"
              >
                {addingTestLead ? "Adding…" : "+ Add"}
              </button>
              {testLeadError && <span className="text-xs text-red-500">{testLeadError}</span>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
