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
  const [mode, setMode] = useState("OUTREACH");
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
        body: { name, rawGoal, mode }
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      if (e.status === 422) setClarification(e.data?.clarification || "Please refine your goal.");
      else setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode("OUTREACH")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "OUTREACH" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Outreach
        </button>
        <button
          type="button"
          onClick={() => setMode("TEST")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "TEST" ? "bg-white shadow text-amber-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Testing
        </button>
      </div>

      {mode === "TEST" && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Test mode — emails use a fixed demo template (no AI generation). Use for pipeline validation only.
        </p>
      )}

      <input
        className="w-full border p-2 rounded"
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <textarea
        className="w-full border p-2 rounded h-32"
        placeholder={mode === "TEST" ? "Describe the test purpose (used for reference only)" : "Describe your outreach goal in natural language"}
        value={rawGoal}
        onChange={(e) => setRawGoal(e.target.value)}
        required
      />
      {clarification && <p className="text-amber-700 text-sm">{clarification}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button disabled={loading} className="bg-black text-white px-4 py-2 rounded">
        {loading ? "Analyzing..." : "Create campaign"}
      </button>
    </form>
  );
}
