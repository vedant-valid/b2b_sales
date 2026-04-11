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

  async function approve() {
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/replies/${reply.id}/approve`, {
        token: session.backendToken, method: "POST", body: { body }
      });
      onApproved?.(reply.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
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
