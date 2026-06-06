"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import SentimentBadge from "./SentimentBadge";

export default function ReplyCard({ reply, onApproved }) {
  const { data: session } = useSession();
  const [body, setBody] = useState(reply.draftFollowUp || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function approve() {
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/replies/${reply.id}/approve`, {
        token: session.backendToken, method: "POST", body: { body }
      });
      setSent(true);
      setTimeout(() => onApproved?.(reply.id), 2500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div className="border rounded p-4 flex items-center gap-3 bg-green-50 border-green-200">
        <div className="text-green-600 text-lg">✓</div>
        <div>
          <div className="font-semibold text-sm text-green-800">Follow-up sent to {reply.lead.firstName} {reply.lead.lastName}</div>
          <div className="text-xs text-green-600">{reply.lead.company}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <div className="font-semibold">{reply.lead.firstName} {reply.lead.lastName}</div>
          <div className="text-xs text-gray-500">{reply.lead.company} · {new Date(reply.receivedAt).toLocaleString()}</div>
        </div>
        <SentimentBadge sentiment={reply.sentiment} />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Reply</div>
        <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded">{reply.body}</pre>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Draft follow-up</div>
        <textarea className="w-full border p-2 rounded text-sm h-24" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button disabled={busy || !body.trim()} onClick={approve} className="bg-green-600 text-white px-3 py-1 rounded text-sm">
        {busy ? "Sending…" : "Approve & send"}
      </button>
    </div>
  );
}
