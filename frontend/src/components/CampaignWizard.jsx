"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function CampaignWizard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [rawGoal, setRawGoal] = useState("");
  const [mode, setMode] = useState("OUTREACH");
  const [testEmailsRaw, setTestEmailsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clarification, setClarification] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senders, setSenders] = useState([]);
  const [sendersLoading, setSendersLoading] = useState(false);

  useEffect(() => {
    if (!session?.backendToken) return;
    setSendersLoading(true);
    apiFetch("/api/sender-accounts/mine", { token: session.backendToken })
      .then(({ senders }) => { setSenders(senders); if (senders.length === 1) setSenderEmail(senders[0].email); })
      .catch(() => {})
      .finally(() => setSendersLoading(false));
  }, [session?.backendToken]);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(""); setClarification("");
    try {
      if (mode === "OUTREACH" && senders.length === 0) {
        setError("No sending account assigned. Ask your admin to assign one from Settings → Senders.");
        setLoading(false);
        return;
      }
      if (mode === "OUTREACH" && senders.length > 1 && !senderEmail) {
        setError("Please select a sending account.");
        setLoading(false);
        return;
      }
      const body = { name, rawGoal, mode };
      if (senderEmail) body.senderEmail = senderEmail;
      if (mode === "TEST") {
        const testEmails = testEmailsRaw
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter((s) => s.includes("@"));
        if (testEmails.length === 0) {
          setError("Add at least one valid email address for the demo.");
          setLoading(false);
          return;
        }
        body.testEmails = testEmails;
      }
      const { campaign } = await apiFetch("/api/campaigns", {
        token: session.backendToken,
        method: "POST",
        body
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      if (e.status === 422) setClarification(e.data?.clarification || "Please refine your goal.");
      else if (e.status === 429) setError("AI quota exceeded — wait a moment and try again.");
      else setError(e.data?.message || e.message);
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode("OUTREACH")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "OUTREACH" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Outreach
        </button>
        <button
          type="button"
          onClick={() => setMode("TEST")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "TEST" ? "bg-white shadow text-amber-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Testing
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        Describe who you want to reach and why — we&apos;ll extract the targeting filters automatically using AI.
      </div>

      {mode === "TEST" && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Test mode — uses a fixed demo email template. Leads are taken from the emails you enter below, no Lusha fetch.
        </p>
      )}

      <input
        className="w-full border p-2 rounded"
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Campaign goal
          <span className="font-normal text-gray-500 ml-2 text-xs">Describe in plain English who you want to reach and why</span>
        </label>
        <textarea
          className="w-full border p-2 rounded h-24"
          placeholder={mode === "TEST" ? "Describe the test purpose (for reference only)" : "Describe your outreach goal in natural language"}
          value={rawGoal}
          onChange={(e) => setRawGoal(e.target.value)}
          required
        />
      </div>

      {mode === "TEST" && (
        <div className="space-y-2">
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Demo mode — emails go to the addresses below instead of real leads. Use this to test the flow end-to-end.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Demo email addresses
            </label>
            <textarea
              className="w-full border p-2 rounded h-32 font-mono text-sm"
              placeholder={"vedant@example.com\nshweta@nstx.co.in\nkritika@newtonschool.co"}
              value={testEmailsRaw}
              onChange={(e) => setTestEmailsRaw(e.target.value)}
              required
            />
            <p className="text-xs text-gray-400 mt-1">One email per line (or comma-separated). These become the leads for this demo campaign.</p>
          </div>
        </div>
      )}

      {/* Sender selection */}
      {!sendersLoading && senders.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          No sending account assigned to you. Ask your admin to assign one from Settings → Senders.
        </div>
      )}
      {senders.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Send from</label>
          <select
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            className="border p-2 rounded w-full text-sm"
            required
          >
            <option value="">Select a sending account…</option>
            {senders.map(s => (
              <option key={s.email} value={s.email}>{s.email}</option>
            ))}
          </select>
        </div>
      )}
      {senders.length === 1 && (
        <p className="text-xs text-gray-500">Sending from: <span className="font-mono">{senders[0].email}</span></p>
      )}
      {clarification && <p className="text-amber-700 text-sm">{clarification}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button disabled={loading} className="bg-black text-white px-4 py-2 rounded">
        {loading ? (mode === "TEST" ? "Creating..." : "Analyzing...") : "Create campaign"}
      </button>
    </form>
  );
}
