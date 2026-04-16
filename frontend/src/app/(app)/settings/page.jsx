"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

const DELIVERABILITY_ITEMS = [
  { id: "domain", label: "Separate sending domain configured in Instantly.ai (e.g. recruit-nst.com)" },
  { id: "spf", label: "SPF record added to sending domain DNS" },
  { id: "dkim", label: "DKIM record added to sending domain DNS" },
  { id: "dmarc", label: "DMARC policy set on sending domain DNS" },
  { id: "warmup", label: "4-week inbox warm-up completed in Instantly.ai" },
  { id: "cap", label: "Daily send volume capped at 30–50 emails/mailbox" }
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [content, setContent] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/brand-doc", { token: session.backendToken })
      .then((data) => {
        if (data.brandDoc) {
          setContent(data.brandDoc.content);
          setSavedAt(data.brandDoc.updatedAt);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const data = await apiFetch("/api/brand-doc", {
        token: session.backendToken,
        method: "POST",
        body: { content }
      });
      setSavedAt(data.brandDoc.updatedAt);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">Brand document</h2>
        <p className="text-sm text-gray-600">
          Paste your brand guidelines here. Every AI-generated email, filter, and follow-up will
          use this as context automatically. Set once — applies to all campaigns.
        </p>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <textarea
              className="w-full h-64 border rounded p-3 text-sm font-mono resize-y disabled:bg-gray-50"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste brand doc content here…"
              disabled={!isAdmin}
            />
            {savedAt && (
              <p className="text-xs text-gray-400">
                Last saved: {new Date(savedAt).toLocaleString()}
              </p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {isAdmin && (
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save brand doc"}
              </button>
            )}
            {!isAdmin && (
              <p className="text-xs text-gray-400">Only admins can update the brand document.</p>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Deliverability checklist</h2>
        <p className="text-sm text-gray-600">
          Complete every item before launching your first campaign. These are manual steps — use them as reference.
        </p>
        <ul className="space-y-2">
          {DELIVERABILITY_ITEMS.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          Docs: see Instantly.ai domain + warm-up setup guides.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">API keys</h2>
        <p className="text-sm text-gray-600">
          Gemini, Lusha, and Instantly.ai keys are configured via backend environment variables.
          Admin-only UI for runtime updates is out of scope for v1.
        </p>
      </section>
    </div>
  );
}
