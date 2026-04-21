"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";
import JobProgressBar from "@/components/JobProgressBar";

export default function CampaignDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  const loadCampaign = useCallback(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign))
      .catch((e) => setError(e.message));
  }, [session?.backendToken, id]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);

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
      await apiFetch(`/api/campaigns/${id}/${gate}`, {
        token: session.backendToken, method: "POST"
      });
      loadCampaign();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  if (!campaign) return <p>Loading...</p>;

  const isViewer = session?.user?.role === "VIEWER";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-gray-600">Status: {campaign.status}</p>
        </div>
        {!isViewer && campaign.status === "DRAFT" && (
          <button onClick={onRun} className="bg-black text-white px-3 py-2 rounded text-sm">
            Run campaign
          </button>
        )}
      </div>

      {campaign.status === "AWAITING_LEAD_APPROVAL" && !isViewer && (
        <div className="border border-yellow-400 bg-yellow-50 rounded p-4 space-y-2">
          <p className="font-semibold text-yellow-800">
            {campaign._count?.leads ?? 0} leads fetched — review below then approve or reject.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onAction("approve-leads")}
              disabled={acting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Approve — generate emails
            </button>
            <button
              onClick={() => onAction("reject-leads")}
              disabled={acting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Reject — discard &amp; reset
            </button>
          </div>
        </div>
      )}

      {campaign.status === "AWAITING_EMAIL_APPROVAL" && !isViewer && (
        <div className="border border-blue-400 bg-blue-50 rounded p-4 space-y-2">
          <p className="font-semibold text-blue-800">
            Emails generated — review drafts below then approve to launch or reject to reset.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onAction("approve-emails")}
              disabled={acting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Approve &amp; launch
            </button>
            <button
              onClick={() => onAction("reject-emails")}
              disabled={acting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Reject — discard &amp; reset
            </button>
          </div>
        </div>
      )}

      {jobId && <JobProgressBar jobId={jobId} />}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <h2 className="font-semibold mb-1">Raw goal</h2>
        <p className="text-sm">{campaign.rawGoal}</p>
      </div>
      <div>
        <h2 className="font-semibold mb-1">Extracted filters</h2>
        <FilterPreview filters={campaign.extractedFilters} />
      </div>
    </div>
  );
}
