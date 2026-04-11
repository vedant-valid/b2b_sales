"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";
import JobProgressBar from "@/components/JobProgressBar";

export default function CampaignDetailPage({ params }) {
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${params.id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign));
  }, [session?.backendToken, params.id]);

  async function onRun() {
    setError("");
    try {
      const { jobId } = await apiFetch(`/api/campaigns/${params.id}/run`, {
        token: session.backendToken,
        method: "POST"
      });
      setJobId(jobId);
    } catch (e) { setError(e.message); }
  }

  if (!campaign) return <p>Loading...</p>;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-gray-600">Status: {campaign.status}</p>
        </div>
        {session?.user?.role !== "VIEWER" && (
          <button onClick={onRun} className="bg-black text-white px-3 py-2 rounded text-sm">
            Run campaign
          </button>
        )}
      </div>
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
