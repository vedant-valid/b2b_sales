"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function ExportModal({ campaignId = "", onClose }) {
  const { data: session } = useSession();
  const [status, setStatus] = useState("");
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
      a.href = url;
      a.download = "leads.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      onClose?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">Export leads</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <select
          className="w-full border rounded p-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="REPLIED">Replied</option>
          <option value="INTERESTED">Interested</option>
          <option value="NOT_INTERESTED">Not interested</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="CONVERTIBLE">Convertible</option>
          <option value="SKIPPED">Skipped</option>
        </select>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded border">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={onDownload}
            className="px-4 py-2 text-sm rounded bg-black text-white disabled:opacity-50"
          >
            {busy ? "Generating…" : "Download .xlsx"}
          </button>
        </div>
      </div>
    </div>
  );
}
