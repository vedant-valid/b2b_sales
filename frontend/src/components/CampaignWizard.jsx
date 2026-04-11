"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function CampaignWizard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [rawGoal, setRawGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clarification, setClarification] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(""); setClarification("");
    try {
      const { campaign } = await apiFetch("/api/campaigns", {
        token: session.backendToken,
        method: "POST",
        body: { name, rawGoal }
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      if (e.status === 422) setClarification(e.data?.clarification || "Please refine your goal.");
      else setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <input className="w-full border p-2 rounded" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
      <textarea className="w-full border p-2 rounded h-32" placeholder="Describe your outreach goal in natural language" value={rawGoal} onChange={(e) => setRawGoal(e.target.value)} required />
      {clarification && <p className="text-amber-700 text-sm">{clarification}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button disabled={loading} className="bg-black text-white px-4 py-2 rounded">{loading ? "Analyzing..." : "Create campaign"}</button>
    </form>
  );
}
