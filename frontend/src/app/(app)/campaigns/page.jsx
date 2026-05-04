"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";

const STATUS_LABELS = {
  DRAFT: "Draft",
  RUNNING: "Running…",
  AWAITING_LEAD_SELECTION: "Review Leads",
  AWAITING_LEAD_APPROVAL: "Approve Leads",
  AWAITING_EMAIL_APPROVAL: "Approve Emails",
  READY_FOR_OUTREACH: "Sending…",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

const STATUS_COLOURS = {
  DRAFT: "bg-gray-100 text-gray-700",
  RUNNING: "bg-blue-100 text-blue-700",
  AWAITING_LEAD_SELECTION: "bg-amber-100 text-amber-700",
  AWAITING_LEAD_APPROVAL: "bg-yellow-100 text-yellow-700",
  AWAITING_EMAIL_APPROVAL: "bg-purple-100 text-purple-700",
  READY_FOR_OUTREACH: "bg-blue-100 text-blue-700",
  PAUSED: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
};

const NEEDS_ACTION = new Set(["AWAITING_LEAD_SELECTION", "AWAITING_LEAD_APPROVAL", "AWAITING_EMAIL_APPROVAL"]);

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[status] ?? "bg-gray-100 text-gray-600"}`}>
      {NEEDS_ACTION.has(status) && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />}
      {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

function CampaignTable({ items }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 py-2">None yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b text-gray-500 text-xs uppercase tracking-wide">
          <th className="pb-2">Name</th>
          <th>Status</th>
          <th>Leads</th>
          <th>Created</th>
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
        <CampaignTable items={outreach} />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Testing</h2>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">demo only</span>
        </div>
        <CampaignTable items={testing} />
      </section>
    </div>
  );
}
