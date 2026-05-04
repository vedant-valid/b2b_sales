"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import ReplyCard from "@/components/ReplyCard";
import { useCallback } from "react";

const GROUPS = [
  {
    key: "CALL",
    label: "Call — High Priority",
    sentiments: ["INTERESTED"],
    style: "border-green-300 bg-green-50",
    badge: "bg-green-600 text-white",
    action: "Call them"
  },
  {
    key: "FOLLOWUP",
    label: "Follow Up — Convertible",
    sentiments: ["CONVERTIBLE"],
    style: "border-blue-300 bg-blue-50",
    badge: "bg-blue-600 text-white",
    action: "Nurture"
  },
  {
    key: "NEUTRAL",
    label: "Neutral — Low Priority",
    sentiments: ["NEUTRAL"],
    style: "border-gray-200 bg-gray-50",
    badge: "bg-gray-400 text-white",
    action: "Monitor"
  },
  {
    key: "NO",
    label: "Do Not Call",
    sentiments: ["NOT_INTERESTED"],
    style: "border-red-200 bg-red-50",
    badge: "bg-red-500 text-white",
    action: "Skip"
  }
];

export default function RepliesPage() {
  const { data: session } = useSession();
  const [replies, setReplies] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!session?.backendToken) return;
    const { replies } = await apiFetch("/api/replies", { token: session.backendToken });
    setReplies(replies);
  }, [session?.backendToken]);

  useEffect(() => { load(); }, [load]);

  async function syncReplies() {
    setSyncing(true);
    try {
      await apiFetch("/api/jobs/poll-replies", { token: session.backendToken, method: "POST" });
      await load();
    } finally { setSyncing(false); }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Replies</h1>
        <button onClick={syncReplies} disabled={syncing} className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50">
          {syncing ? "Syncing…" : "Sync replies"}
        </button>
      </div>
        <p className="text-sm text-gray-500 mt-1">
          Replies appear here automatically when leads respond to your emails.
        </p>
      {replies.length === 0 && (
        <div className="text-center py-16 text-gray-400 space-y-2">
          <p className="text-lg font-medium text-gray-500">No replies yet</p>
          <p className="text-sm">When leads respond to your emails, they&apos;ll show up here — grouped by how interested they seem.</p>
        </div>
      )}
      {GROUPS.map((group) => {
        const grouped = replies.filter((r) => group.sentiments.includes(r.sentiment));
        if (grouped.length === 0) return null;
        return (
          <section key={group.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{group.label}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.badge}`}>{grouped.length}</span>
              <span className="text-xs text-gray-400 italic">{group.action}</span>
            </div>
            <div className={`space-y-3 border rounded-lg p-4 ${group.style}`}>
              {grouped.map((r) => <ReplyCard key={r.id} reply={r} onApproved={(id) => setReplies(prev => prev.filter(r => r.id !== id))} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
