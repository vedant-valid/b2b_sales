"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";

export default function CampaignDetailPage({ params }) {
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${params.id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign));
  }, [session?.backendToken, params.id]);

  if (!campaign) return <p>Loading...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{campaign.name}</h1>
      <p className="text-sm text-gray-600">Status: {campaign.status}</p>
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
