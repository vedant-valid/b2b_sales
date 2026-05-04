"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function LeadRowActions({ lead, token, onStatusChange }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function transition(newStatus) {
    setBusy(true);
    setError("");
    const prev = lead.status;
    onStatusChange(lead.id, newStatus);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        token,
        method: "PATCH",
        body: { status: newStatus },
      });
    } catch {
      onStatusChange(lead.id, prev);
      setError("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2 text-xs whitespace-nowrap">
      {lead.status === "NEW" && (
        <button
          disabled={busy}
          onClick={() => transition("CONTACTED")}
          className="text-blue-600 hover:underline disabled:opacity-50"
        >
          Contacted
        </button>
      )}
      {lead.status === "CONTACTED" && (
        <button
          disabled={busy}
          onClick={() => transition("NEW")}
          className="text-gray-500 hover:underline disabled:opacity-50"
        >
          Undo
        </button>
      )}
      {lead.status !== "SKIPPED" && (
        <button
          disabled={busy}
          onClick={() => transition("SKIPPED")}
          className="text-red-500 hover:underline disabled:opacity-50"
        >
          Irrelevant
        </button>
      )}
      {lead.status === "SKIPPED" && (
        <button
          disabled={busy}
          onClick={() => transition("NEW")}
          className="text-gray-500 hover:underline disabled:opacity-50"
        >
          Restore
        </button>
      )}
      {error && <span className="text-red-400">{error}</span>}
    </span>
  );
}
