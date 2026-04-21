"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import LeadTable from "@/components/LeadTable";

export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/leads", { token: session.backendToken })
      .then(({ leads }) => setLeads(leads))
      .catch((err) => { if (err.status === 401) signOut({ callbackUrl: "/login" }); });
  }, [session?.backendToken]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Leads</h1>
      <LeadTable leads={leads} />
    </div>
  );
}
