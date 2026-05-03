"use client";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

const VARIABLES = ["{{firstName}}", "{{lastName}}", "{{title}}", "{{company}}", "{{aiPersonalization}}"];

function clientSubstitute(template, lead) {
  return template
    .replace(/\{\{firstName\}\}/g, lead?.firstName ?? "")
    .replace(/\{\{lastName\}\}/g, lead?.lastName ?? "")
    .replace(/\{\{title\}\}/g, lead?.title ?? "")
    .replace(/\{\{company\}\}/g, lead?.company ?? "")
    .replace(/\{\{aiPersonalization\}\}/g, "[AI personalisation]");
}

export default function EmailTemplatePanel({ campaignId, token }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("edit");
  const [emailMode, setEmailMode] = useState("AI");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [savedSubject, setSavedSubject] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [previewLead, setPreviewLead] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

  const dirty = subject !== savedSubject || body !== savedBody;

  useEffect(() => {
    if (!open || !token) return;
    apiFetch(`/api/campaigns/${campaignId}/template`, { token })
      .then(({ emailMode: mode, emailTemplateSubject: s, emailTemplateBody: b }) => {
        setEmailMode(mode);
        setSubject(s ?? "");
        setBody(b ?? "");
        setSavedSubject(s ?? "");
        setSavedBody(b ?? "");
      })
      .catch(() => {});
  }, [open, campaignId, token]);

  useEffect(() => {
    if (tab !== "preview" || !token) return;
    apiFetch(`/api/leads?campaignId=${campaignId}`, { token })
      .then(({ leads }) => setPreviewLead(leads?.[0] ?? null))
      .catch(() => {});
  }, [tab, campaignId, token, savedSubject]);

  function handleTabChange(next) {
    if (dirty) {
      if (!confirm("You have unsaved changes. Discard and switch tabs?")) return;
      setSubject(savedSubject);
      setBody(savedBody);
    }
    setTab(next);
  }

  function insertVariable(variable, field) {
    const ref = field === "subject" ? subjectRef : bodyRef;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.slice(0, start) + variable + el.value.slice(end);
    if (field === "subject") setSubject(newVal);
    else setBody(newVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      const result = await apiFetch(`/api/campaigns/${campaignId}/template`, {
        token,
        method: "PUT",
        body: { emailMode: "TEMPLATE", subject, body }
      });
      setEmailMode(result.emailMode);
      setSavedSubject(result.emailTemplateSubject ?? "");
      setSavedBody(result.emailTemplateBody ?? "");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setSaveError(e.data?.error || e.message || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSwitchToAI() {
    setSaving(true);
    setSaveError("");
    try {
      await apiFetch(`/api/campaigns/${campaignId}/template`, {
        token,
        method: "PUT",
        body: { emailMode: "AI" }
      });
      setEmailMode("AI");
      setSubject("");
      setBody("");
      setSavedSubject("");
      setSavedBody("");
      setTab("edit");
    } catch (e) {
      setSaveError(e.data?.error || e.message || "Failed to switch mode.");
    } finally {
      setSaving(false);
    }
  }

  const modeBadge = emailMode === "TEMPLATE"
    ? <span className="text-xs bg-purple-100 text-purple-700 border border-purple-300 px-2 py-0.5 rounded-full font-semibold">Template</span>
    : <span className="text-xs bg-gray-100 text-gray-600 border border-gray-300 px-2 py-0.5 rounded-full">AI</span>;

  return (
    <div className="border border-gray-200 rounded">
      <button
        className="w-full flex justify-between items-center px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-left rounded"
        onClick={() => setOpen(v => !v)}
      >
        <span>Email Template</span>
        <div className="flex items-center gap-2">
          {modeBadge}
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 p-4 space-y-3">
          <div className="flex gap-1 border-b border-gray-200 pb-2">
            {["edit", "preview", "ai-mode"].map(t => (
              <button
                key={t}
                onClick={() => handleTabChange(t)}
                className={`px-3 py-1 text-xs rounded font-medium ${tab === t ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {t === "edit" ? "Edit" : t === "preview" ? "Preview" : "AI Mode"}
              </button>
            ))}
          </div>

          {tab === "edit" && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Variables — click to insert at cursor</div>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map(v => (
                    <div key={v} className="flex gap-0.5">
                      <button
                        onClick={() => insertVariable(v, "subject")}
                        className={`text-xs px-2 py-0.5 rounded border cursor-pointer font-mono ${v === "{{aiPersonalization}}" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-700"} hover:bg-gray-100`}
                        title="Insert into subject"
                      >
                        {v} <span className="text-gray-400">S</span>
                      </button>
                      <button
                        onClick={() => insertVariable(v, "body")}
                        className={`text-xs px-2 py-0.5 rounded border cursor-pointer font-mono ${v === "{{aiPersonalization}}" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-700"} hover:bg-gray-100`}
                        title="Insert into body"
                      >
                        <span className="text-gray-400">B</span>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">S = insert into Subject, B = insert into Body</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Subject</label>
                <input
                  ref={subjectRef}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                  placeholder="e.g. {{firstName}}, you're invited | NST Placement Drive"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Body</label>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={8}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-gray-500 resize-y"
                  placeholder="Hi {{firstName}},&#10;&#10;..."
                />
              </div>
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{saveError}</p>}
              <div className="flex justify-end gap-2 items-center">
                {saveSuccess && <span className="text-xs text-green-600 font-medium">Saved</span>}
                <button
                  onClick={handleSave}
                  disabled={saving || !subject.trim() || !body.trim()}
                  className="bg-black text-white text-sm px-4 py-1.5 rounded disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save Template"}
                </button>
              </div>
            </div>
          )}

          {tab === "preview" && (
            <div className="space-y-2">
              {!previewLead ? (
                <p className="text-sm text-gray-500">No leads to preview yet.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Preview using: <strong>{previewLead.firstName} {previewLead.lastName}</strong> · {previewLead.title} · {previewLead.company}</p>
                  {savedSubject ? (
                    <div className="border rounded p-3 space-y-2 bg-gray-50">
                      <div className="font-semibold text-sm">{clientSubstitute(savedSubject, previewLead)}</div>
                      <pre className="whitespace-pre-wrap text-sm">{clientSubstitute(savedBody, previewLead)}</pre>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No template saved yet — save from the Edit tab first.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "ai-mode" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Currently using: <strong>{emailMode === "TEMPLATE" ? "Template mode" : "AI generation"}</strong>
              </p>
              {emailMode === "TEMPLATE" ? (
                <>
                  <p className="text-sm text-gray-500">Switch back to AI — Gemini will generate a unique email per lead. Your saved template will be cleared.</p>
                  <button
                    onClick={handleSwitchToAI}
                    disabled={saving}
                    className="bg-gray-800 text-white text-sm px-4 py-1.5 rounded disabled:opacity-40"
                  >
                    {saving ? "Switching…" : "Switch to AI generation"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-500">Already in AI mode. Write a template in the Edit tab and save it to switch to Template mode.</p>
              )}
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
