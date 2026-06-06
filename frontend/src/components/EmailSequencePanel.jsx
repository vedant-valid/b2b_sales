"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function EmailSequencePanel({ campaignId, token }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState([]);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [revisePrompt, setRevisePrompt] = useState("");
  const [error, setError] = useState("");
  const [savedSteps, setSavedSteps] = useState([]);

  useEffect(() => {
    if (!open || !token) return;
    apiFetch(`/api/campaigns/${campaignId}/sequence`, { token })
      .then(({ steps: s, sequenceApproved }) => {
        setSteps(s);
        setSavedSteps(s);
        setApproved(sequenceApproved);
      })
      .catch(() => {});
  }, [open, campaignId, token]);

  const dirty = JSON.stringify(steps) !== JSON.stringify(savedSteps);

  function updateStep(idx, field, value) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const { steps: s } = await apiFetch(`/api/campaigns/${campaignId}/sequence/generate`, {
        token, method: "POST"
      });
      setSteps(s);
      setSavedSteps(s);
      setApproved(false);
    } catch (e) {
      setError(e.data?.message || e.message || "Generation failed — try again.");
    } finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const { steps: s } = await apiFetch(`/api/campaigns/${campaignId}/sequence`, {
        token, method: "PUT",
        body: { steps }
      });
      setSteps(s);
      setSavedSteps(s);
      setApproved(false);
    } catch (e) {
      setError(e.data?.message || e.message || "Save failed.");
    } finally { setSaving(false); }
  }

  async function handleRevise() {
    if (!revisePrompt.trim()) return;
    setRevising(true);
    setError("");
    try {
      const { steps: s } = await apiFetch(`/api/campaigns/${campaignId}/sequence/revise`, {
        token, method: "POST",
        body: { prompt: revisePrompt }
      });
      setSteps(s);
      setSavedSteps(s);
      setApproved(false);
      setRevisePrompt("");
    } catch (e) {
      setError(e.data?.message || e.message || "Revision failed — try again.");
    } finally { setRevising(false); }
  }

  async function handleApprove() {
    setError("");
    try {
      await apiFetch(`/api/campaigns/${campaignId}/sequence/approve`, { token, method: "POST" });
      setApproved(true);
    } catch (e) {
      setError(e.data?.message || e.message || "Approve failed.");
    }
  }

  const approvedBadge = approved
    ? <span className="text-xs bg-green-100 text-green-700 border border-green-300 px-2 py-0.5 rounded-full font-semibold">Approved</span>
    : steps.length > 0
      ? <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full">Pending review</span>
      : null;

  return (
    <div className="border border-gray-200 rounded">
      <button
        className="w-full flex justify-between items-center px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-left rounded"
        onClick={() => setOpen(v => !v)}
      >
        <span>Email Sequence</span>
        <div className="flex items-center gap-2">
          {approvedBadge}
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}

          {/* Generate button */}
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">
              {steps.length === 0
                ? "No sequence yet. Generate one from your campaign goal and brand doc."
                : `${steps.length}-step sequence`}
            </p>
            <button
              onClick={handleGenerate}
              disabled={loading || saving || revising}
              className="text-xs bg-black text-white px-3 py-1.5 rounded disabled:opacity-40"
            >
              {loading ? "Generating…" : steps.length === 0 ? "Generate sequence" : "Regenerate"}
            </button>
          </div>

          {/* Step cards */}
          {steps.map((step, idx) => (
            <div key={step.stepNumber} className="border border-gray-200 rounded p-3 space-y-2 bg-white">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Step {step.stepNumber}
                </span>
                <span className="text-xs text-gray-400">
                  {step.delayDays === 0 ? "Sent immediately" : `+${step.delayDays} days after previous`}
                </span>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Subject</label>
                <input
                  value={step.subject}
                  onChange={e => updateStep(idx, "subject", e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Body</label>
                <textarea
                  value={step.body}
                  onChange={e => updateStep(idx, "body", e.target.value)}
                  rows={5}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-gray-500 resize-y"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Delay (days after previous step)</label>
                <input
                  type="number"
                  min={0}
                  value={step.delayDays}
                  onChange={e => updateStep(idx, "delayDays", parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-24 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>
          ))}

          {/* Save inline edits */}
          {dirty && steps.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || revising}
                className="text-sm bg-gray-800 text-white px-4 py-1.5 rounded disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}

          {/* Revise with AI */}
          {steps.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-700">Revise with AI</p>
              <p className="text-xs text-gray-400">
                e.g. "make step 1 shorter", "add more urgency to step 2", "remove the Sarvam reference in step 3"
              </p>
              <div className="flex gap-2">
                <input
                  value={revisePrompt}
                  onChange={e => setRevisePrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRevise(); } }}
                  placeholder="Describe your change…"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                />
                <button
                  onClick={handleRevise}
                  disabled={revising || loading || !revisePrompt.trim()}
                  className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded disabled:opacity-40"
                >
                  {revising ? "Revising…" : "Revise"}
                </button>
              </div>
            </div>
          )}

          {/* Approve */}
          {steps.length > 0 && !dirty && (
            <div className="flex justify-end items-center gap-3 border-t border-gray-100 pt-3">
              {approved && (
                <span className="text-xs text-green-600 font-medium">Sequence approved ✓</span>
              )}
              {!approved && (
                <button
                  onClick={handleApprove}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded"
                >
                  Approve sequence
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
