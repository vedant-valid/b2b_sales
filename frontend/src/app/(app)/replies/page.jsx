"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import ReplyCard from "@/components/ReplyCard";

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

  async function load() {
    if (!session?.backendToken) return;
    const { replies } = await apiFetch("/api/replies", { token: session.backendToken });
    setReplies(replies);
  }
  useEffect(() => { load(); }, [session?.backendToken]);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Replies</h1>
      {GROUPS.map((group) => {
        const grouped = replies.filter((r) => group.sentiments.includes(r.sentiment));
        return (
          <section key={group.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{group.label}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.badge}`}>{grouped.length}</span>
              <span className="text-xs text-gray-400 italic">{group.action}</span>
            </div>
            {grouped.length === 0
              ? <p className="text-sm text-gray-400 pl-1">None.</p>
              : <div className={`space-y-3 border rounded-lg p-4 ${group.style}`}>
                  {grouped.map((r) => <ReplyCard key={r.id} reply={r} onApproved={load} />)}
                </div>
            }
          </section>
        );
      })}
    </div>
  );
}
