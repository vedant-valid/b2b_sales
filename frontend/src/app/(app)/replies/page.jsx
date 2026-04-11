"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import ReplyCard from "@/components/ReplyCard";

export default function RepliesPage() {
  const { data: session } = useSession();
  const [replies, setReplies] = useState([]);
  const [filter, setFilter] = useState("");

  async function load() {
    if (!session?.backendToken) return;
    const q = filter ? `?sentiment=${filter}` : "";
    const { replies } = await apiFetch(`/api/replies${q}`, { token: session.backendToken });
    setReplies(replies);
  }
  useEffect(() => { load(); }, [session?.backendToken, filter]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-xl font-bold">Replies</h1>
        <select className="border rounded p-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="INTERESTED">Interested</option>
          <option value="NOT_INTERESTED">Not interested</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="CONVERTIBLE">Convertible</option>
        </select>
      </div>
      <div className="space-y-4">
        {replies.map((r) => <ReplyCard key={r.id} reply={r} onApproved={() => load()} />)}
      </div>
    </div>
  );
}
