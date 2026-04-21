"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function EmailDraftPanel({ leadId, emails: initial, onRefresh }) {
  const { data: session } = useSession();
  const [emails, setEmails] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const token = session?.backendToken;

  async function reload() {
    const { emails } = await apiFetch(`/api/leads/${leadId}/emails`, { token });
    setEmails(emails);
    onRefresh?.();
  }

  async function generate() {
    setBusy(true);
    try {
      await apiFetch(`/api/leads/${leadId}/emails`, { token, method: "POST" });
      setTimeout(reload, 2000);
    } finally { setBusy(false); }
  }

  async function regenerate(id) {
    setBusy(true);
    try {
      await apiFetch(`/api/emails/${id}/regenerate`, { token, method: "POST" });
      setTimeout(reload, 2000);
    } finally { setBusy(false); }
  }

  async function send(id) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/emails/${id}/send`, { token, method: "POST" });
      reload();
    } catch (e) {
      setError(e.data?.detail || e.message || "Failed to send email.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Emails</h2>
        <button disabled={busy} onClick={generate} className="bg-black text-white px-3 py-1 rounded text-sm">
          {busy ? "Working…" : "Generate draft"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
      {emails.length === 0 && <p className="text-sm text-gray-500">No drafts yet.</p>}
      {emails.map((e) => (
        <div key={e.id} className="border rounded p-3 space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>v{e.version} · {e.status}</span>
            <span>{new Date(e.createdAt).toLocaleString()}</span>
          </div>
          <div className="font-semibold">{e.subject}</div>
          <pre className="whitespace-pre-wrap text-sm">{e.body}</pre>
          {e.status === "DRAFT" && (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => regenerate(e.id)} className="text-sm underline">Regenerate</button>
              <button disabled={busy} onClick={() => send(e.id)} className="text-sm bg-green-600 text-white px-3 py-1 rounded">Send</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
