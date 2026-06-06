"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { apiFetch, BASE } from "@/lib/api";

const DELIVERABILITY_ITEMS = [
  { id: "domain", label: "Separate sending domain configured in Instantly.ai (e.g. recruit-nst.com)" },
  { id: "spf", label: "SPF record added to sending domain DNS" },
  { id: "dkim", label: "DKIM record added to sending domain DNS" },
  { id: "dmarc", label: "DMARC policy set on sending domain DNS" },
  { id: "warmup", label: "4-week inbox warm-up completed in Instantly.ai" },
  { id: "cap", label: "Daily send volume capped at 30–50 emails/mailbox" }
];

const EMPTY_FIELDS = { tone: "", campaignGoals: "", targetPersonas: "", proofPoints: "", bannedWords: "" };

export default function SettingsPage() {
  const { data: session } = useSession();
  const token = session?.backendToken;

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [fileName, setFileName] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extracted, setExtracted] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/brand-doc", { token })
      .then((data) => {
        if (data.brandDoc) {
          setFields({
            tone: data.brandDoc.tone ?? "",
            campaignGoals: data.brandDoc.campaignGoals ?? "",
            targetPersonas: data.brandDoc.targetPersonas ?? "",
            proofPoints: data.brandDoc.proofPoints ?? "",
            bannedWords: data.brandDoc.bannedWords ?? ""
          });
          setFileName(data.brandDoc.fileName ?? "");
          setSavedAt(data.brandDoc.updatedAt);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  function setField(key, value) {
    setFields(f => ({ ...f, [key]: value }));
    setExtracted(false);
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setExtracting(true);
    setExtractError("");
    setExtracted(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/api/brand-doc/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMessages = {
          no_file: "No file received — please try again.",
          unsupported_file_type: "Only PDF and DOCX files are supported.",
          ai_rate_limit: "AI is rate-limited — wait a moment and try again.",
        };
        throw new Error(errMessages[data.error] || "Extraction failed — please try again.");
      }
      if (!data.fields) throw new Error("No fields extracted from document");
      setFields({
        tone: data.fields.tone ?? "",
        campaignGoals: data.fields.campaignGoals ?? "",
        targetPersonas: data.fields.targetPersonas ?? "",
        proofPoints: data.fields.proofPoints ?? "",
        bannedWords: data.fields.bannedWords ?? ""
      });
      setFileName(data.fileName ?? "");
      setExtracted(true);
    } catch (err) {
      setExtractError(err.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function onSave() {
    setSaveError("");
    setSaving(true);
    try {
      const body = {
        tone: fields.tone || null,
        campaignGoals: fields.campaignGoals || null,
        targetPersonas: fields.targetPersonas || null,
        proofPoints: fields.proofPoints || null,
        bannedWords: fields.bannedWords || null,
        fileName: fileName || null
      };
      const data = await apiFetch("/api/brand-doc", { token, method: "POST", body });
      setSavedAt(data.brandDoc.updatedAt);
      setExtracted(false);
    } catch (err) {
      setSaveError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400 p-6">Loading…</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Brand Settings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Set once — every AI-generated email, filter, and follow-up draws from this automatically.
          </p>
        </div>

        {/* Upload */}
        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center space-y-2 bg-gray-50">
          <p className="text-sm text-gray-600">Upload a PDF or DOCX to auto-extract fields below</p>
          <label className="inline-block cursor-pointer bg-black text-white text-sm px-4 py-1.5 rounded">
            {extracting ? "Extracting…" : "Choose file"}
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={onUpload}
              disabled={extracting}
            />
          </label>
          {fileName && <p className="text-xs text-gray-500">{fileName}</p>}
          {extractError && <p className="text-xs text-red-500">{extractError}</p>}
          {extracted && (
            <p className="text-xs text-amber-600">⚠ Fields extracted — review and edit before saving</p>
          )}
        </div>

        {/* Tone */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Tone</label>
          <input
            className={`w-full border rounded-md px-3 py-2 text-sm ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder='e.g. "Professional, concise, no jargon"'
            value={fields.tone}
            onChange={e => setField("tone", e.target.value)}
          />
        </div>

        {/* Campaign Goals */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Campaign Goals</label>
          <textarea
            rows={3}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder="Who you want to reach and what outcome you want"
            value={fields.campaignGoals}
            onChange={e => setField("campaignGoals", e.target.value)}
          />
        </div>

        {/* Target Personas */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Target Personas</label>
          <textarea
            rows={3}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder="Description of your ideal leads"
            value={fields.targetPersonas}
            onChange={e => setField("targetPersonas", e.target.value)}
          />
        </div>

        {/* Proof Points */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Proof Points</label>
          <p className="text-xs text-gray-400">One per line. AI weaves these into emails as credibility signals.</p>
          <textarea
            rows={4}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y font-mono ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder={"3x pipeline increase for Acme Corp in 90 days\nSaved $200K annually for XYZ SaaS"}
            value={fields.proofPoints}
            onChange={e => setField("proofPoints", e.target.value)}
          />
        </div>

        {/* Banned Words */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Banned Words</label>
          <p className="text-xs text-gray-400">Comma-separated or one per line. AI will never use these.</p>
          <textarea
            rows={2}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y font-mono ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder="synergy, leverage, disrupt, game-changer"
            value={fields.bannedWords}
            onChange={e => setField("bannedWords", e.target.value)}
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save brand settings"}
          </button>
          {savedAt && (
            <span className="text-xs text-gray-400">
              Last saved: {new Date(savedAt).toLocaleString()}
            </span>
          )}
        </div>
        {saveError && <p className="text-sm text-red-500">{saveError}</p>}
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
