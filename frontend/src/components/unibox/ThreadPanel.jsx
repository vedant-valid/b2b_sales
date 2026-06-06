"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

const SENTIMENT_COLORS = {
  INTERESTED:     "text-green-600",
  CONVERTIBLE:    "text-blue-600",
  NEUTRAL:        "text-gray-500",
  NOT_INTERESTED: "text-red-500",
};

export default function ThreadPanel({ lead }) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const loadThread = useCallback(async () => {
    if (!lead || !session?.backendToken) return;
    setLoading(true);
    try {
      const { messages } = await apiFetch(`/api/leads/${lead.id}/thread`, { token: session.backendToken });
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [lead?.id, session?.backendToken]);

  useEffect(() => {
    setMessages([]);
    setReplyBody("");
    setError(null);
    loadThread();
  }, [loadThread]);

  async function sendReply() {
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}/reply`, {
        token: session.backendToken,
        method: "POST",
        body: { body: replyBody },
      });
      setReplyBody("");
      await loadThread();
    } catch (e) {
      setError(
        e.message === "campaign_not_dispatched"
          ? "Campaign not yet sent to Instantly."
          : e.message || "Failed to send."
      );
    } finally {
      setSending(false);
    }
  }

  if (!lead) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Select a lead to view their conversation.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <span className="font-semibold">{lead.firstName} {lead.lastName}</span>
          <span className="text-gray-400 text-xs ml-2">{lead.email}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{lead.status}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-xs text-gray-400">Loading…</p>}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[75%]">
              <div className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                msg.direction === "outbound"
                  ? "bg-black text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-900 rounded-bl-sm"
              }`}>
                {msg.direction === "outbound" && msg.subject && (
                  <div className="font-semibold text-xs mb-1 opacity-70">{msg.subject}</div>
                )}
                {msg.body}
              </div>
              <div className={`text-xs text-gray-400 mt-1 ${msg.direction === "outbound" ? "text-right" : "text-left"}`}>
                {new Date(msg.timestamp).toLocaleString()}
                {msg.sentiment && (
                  <span className={`ml-2 font-medium ${SENTIMENT_COLORS[msg.sentiment] ?? ""}`}>
                    {msg.sentiment.charAt(0) + msg.sentiment.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t space-y-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <textarea
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
          rows={3}
          placeholder="Write a follow-up…"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-gray-500"
        />
        <div className="flex justify-end">
          <button
            disabled={sending || !replyBody.trim()}
            onClick={sendReply}
            className="bg-black text-white text-sm px-4 py-1.5 rounded disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send via Instantly"}
          </button>
        </div>
      </div>
    </div>
  );
}
