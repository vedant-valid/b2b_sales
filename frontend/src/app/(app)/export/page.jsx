"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function ExportPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (campaignId) qs.set("campaignId", campaignId);
      const res = await fetch(`${BASE}/api/export/leads?${qs}`, {
        headers: { Authorization: `Bearer ${session.backendToken}` }
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "leads.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-xl font-bold">Export leads</h1>
      <input className="w-full border p-2 rounded" placeholder="Campaign ID (optional)" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
      <select className="w-full border p-2 rounded" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Any status</option>
        <option>NEW</option><option>CONTACTED</option><option>REPLIED</option>
        <option>INTERESTED</option><option>NOT_INTERESTED</option><option>NEUTRAL</option>
        <option>CONVERTIBLE</option><option>SKIPPED</option>
      </select>
      <button disabled={busy} onClick={onDownload} className="bg-black text-white px-4 py-2 rounded">
        {busy ? "Generating…" : "Download .xlsx"}
      </button>
    </div>
  );
}
