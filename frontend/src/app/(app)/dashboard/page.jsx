"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { campaignStatusLabel, campaignStatusNeedsAction } from "@/lib/campaignStatus";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [replies, setReplies] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    Promise.all([
      apiFetch("/api/campaigns", { token: session.backendToken }),
      apiFetch("/api/leads", { token: session.backendToken }),
      apiFetch("/api/replies", { token: session.backendToken }),
    ]).then(([c, l, r]) => {
      setCampaigns(c.campaigns || []);
      setLeads(l.leads || []);
      setReplies(r.replies || []);
    }).catch(() => {});
  }, [session?.backendToken]);

  const needsAction = campaigns.filter(c => campaignStatusNeedsAction(c.status));
  const recentCampaigns = [...campaigns].slice(0, 5);

  const activeLeads = leads.filter(l => l.status !== "SKIPPED").length;
  const contacted   = leads.filter(l => l.status === "CONTACTED").length;
  const interested  = leads.filter(l => ["INTERESTED", "CONVERTIBLE"].includes(l.status)).length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Link href="/campaigns/new" className="bg-black text-white px-4 py-2 rounded text-sm">
          + New campaign
        </Link>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Needs your attention</h2>
        {needsAction.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-3">
            <span>✓</span>
            <span>You&apos;re all caught up — no campaigns waiting on you right now.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {needsAction.map(c => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between border rounded px-4 py-3 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">{campaignStatusLabel(c.status)}</div>
                  </div>
                </div>
                <span className="text-xs text-gray-400 group-hover:text-gray-700">Go →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active leads", value: activeLeads,   href: "/leads"   },
            { label: "Contacted",    value: contacted,      href: "/leads"   },
            { label: "Replies",      value: replies.length, href: "/replies" },
            { label: "Interested",   value: interested,     href: "/leads"   },
          ].map(({ label, value, href }) => (
            <Link key={label} href={href} className="border rounded p-4 hover:bg-gray-50 transition-colors">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-2xl font-bold">{value}</div>
            </Link>
          ))}
        </div>
      </section>

      {recentCampaigns.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Recent campaigns</h2>
          <div className="border rounded divide-y">
            {recentCampaigns.map(c => (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm">
                <span className="font-medium">{c.name}</span>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{c._count?.leads ?? 0} leads</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    campaignStatusNeedsAction(c.status) ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {campaignStatusLabel(c.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {campaigns.length === 0 && (
        <div className="text-center py-16 text-gray-500 space-y-3">
          <p className="text-lg font-medium">No campaigns yet</p>
          <p className="text-sm">Create your first campaign to start reaching leads.</p>
          <Link href="/campaigns/new" className="inline-block bg-black text-white px-4 py-2 rounded text-sm mt-2">
            + New campaign
          </Link>
        </div>
      )}
    </div>
  );
}
