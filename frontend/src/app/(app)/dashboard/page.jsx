"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState({ campaigns: 0, leads: 0, replies: 0 });

  useEffect(() => {
    if (!session?.backendToken) return;
    Promise.all([
      apiFetch("/api/campaigns", { token: session.backendToken }),
      apiFetch("/api/leads", { token: session.backendToken }),
      apiFetch("/api/replies", { token: session.backendToken })
    ]).then(([c, l, r]) => setStats({
      campaigns: c.campaigns.length,
      leads: l.leads.length,
      replies: r.replies.length
    })).catch(() => {});
  }, [session?.backendToken]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <Link href="/campaigns" className="border rounded p-4 hover:bg-gray-50">
          <div className="text-xs text-gray-500">Campaigns</div>
          <div className="text-3xl font-bold">{stats.campaigns}</div>
        </Link>
        <Link href="/leads" className="border rounded p-4 hover:bg-gray-50">
          <div className="text-xs text-gray-500">Leads</div>
          <div className="text-3xl font-bold">{stats.leads}</div>
        </Link>
        <Link href="/replies" className="border rounded p-4 hover:bg-gray-50">
          <div className="text-xs text-gray-500">Replies</div>
          <div className="text-3xl font-bold">{stats.replies}</div>
        </Link>
      </div>
      <Link href="/campaigns/new" className="inline-block bg-black text-white px-4 py-2 rounded">
        + New campaign
      </Link>
    </div>
  );
}
