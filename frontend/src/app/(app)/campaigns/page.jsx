"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function CampaignsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/campaigns", { token: session.backendToken })
      .then(({ campaigns }) => setItems(campaigns))
      .catch((err) => { if (err.status === 401) signOut({ callbackUrl: "/login" }); });
  }, [session?.backendToken]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between"><h1 className="text-xl font-bold">Campaigns</h1>
        <Link className="bg-black text-white px-3 py-2 rounded text-sm" href="/campaigns/new">New campaign</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Name</th><th>Status</th><th>Leads</th><th>Created</th></tr></thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b hover:bg-gray-50">
              <td className="py-2"><Link className="underline" href={`/campaigns/${c.id}`}>{c.name}</Link></td>
              <td>{c.status}</td>
              <td>{c._count?.leads ?? 0}</td>
              <td>{new Date(c.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
