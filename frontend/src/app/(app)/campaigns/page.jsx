"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { campaignStatusLabel, campaignStatusNeedsAction } from "@/lib/campaignStatus";

function StatusBadge({ status }) {
  const needsAction = campaignStatusNeedsAction(status);
  const colours = {
    DRAFT: "bg-gray-100 text-gray-700",
    RUNNING: "bg-blue-100 text-blue-700",
    AWAITING_LEAD_SELECTION: "bg-amber-100 text-amber-700",
    AWAITING_LEAD_APPROVAL: "bg-yellow-100 text-yellow-700",
    AWAITING_EMAIL_APPROVAL: "bg-purple-100 text-purple-700",
    READY_FOR_OUTREACH: "bg-blue-100 text-blue-700",
    PAUSED: "bg-orange-100 text-orange-700",
    COMPLETED: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colours[status] ?? "bg-gray-100 text-gray-600"}`}>
      {needsAction && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />}
      {campaignStatusLabel(status)}
    </span>
  );
}

function CampaignTable({ items, onDelete }) {
  if (items.length === 0) return (
    <div className="py-6 text-center text-gray-400 text-sm space-y-2">
      <p>No campaigns here yet.</p>
      <a href="/campaigns/new" className="text-gray-600 underline text-sm">Create one →</a>
    </div>
  );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b text-gray-500 text-xs uppercase tracking-wide">
          <th className="pb-2">Name</th>
          <th>Status</th>
          <th>Leads</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((c) => (
          <tr key={c.id} className="border-b hover:bg-gray-50">
            <td className="py-2">
              <Link className="underline" href={`/campaigns/${c.id}`}>{c.name}</Link>
            </td>
            <td><StatusBadge status={c.status} /></td>
            <td>{c._count?.leads ?? 0}</td>
            <td>{new Date(c.createdAt).toLocaleDateString()}</td>
            <td className="text-right pr-1">
              <button
                onClick={() => onDelete(c)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors px-1"
                title="Delete campaign"
              >
                ✕
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CampaignsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/campaigns", { token: session.backendToken })
      .then(({ campaigns }) => setItems(campaigns))
      .catch((err) => { if (err.status === 401) signOut({ callbackUrl: "/login" }); });
  }, [session?.backendToken]);

  const outreach = items.filter((c) => c.mode !== "TEST");
  const testing = items.filter((c) => c.mode === "TEST");

  async function onDelete(campaign) {
    if (!confirm(`Delete "${campaign.name}"? This removes all leads, emails, and replies. This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/campaigns/${campaign.id}`, { token: session?.backendToken, method: "DELETE" });
      setItems(prev => prev.filter(c => c.id !== campaign.id));
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Campaigns</h1>
        <Link className="bg-black text-white px-3 py-2 rounded text-sm" href="/campaigns/new">
          New campaign
        </Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Outreach
        </h2>
        <CampaignTable items={outreach} onDelete={onDelete} />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Testing</h2>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">demo only</span>
        </div>
        <CampaignTable items={testing} onDelete={onDelete} />
      </section>
    </div>
  );
}
