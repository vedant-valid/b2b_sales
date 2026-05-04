"use client";
import Link from "next/link";
import LeadStatusBadge from "./LeadStatusBadge";
import LeadRowActions from "./LeadRowActions";

export default function LeadTable({ leads, token, onStatusChange }) {
  const withActions = token && onStatusChange;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b text-gray-500 text-xs uppercase tracking-wide">
          <th className="pb-1 pr-3">Name</th>
          <th className="pr-3">Title</th>
          <th className="pr-3">Company</th>
          <th className="pr-3">Email</th>
          <th className="pr-3">Status</th>
          {withActions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className="py-2 pr-3">
              <Link className="underline" href={`/leads/${l.id}`}>
                {l.firstName} {l.lastName}
              </Link>
            </td>
            <td className="pr-3">{l.title ?? "—"}</td>
            <td className="pr-3">{l.company ?? "—"}</td>
            <td className="pr-3">{l.email ?? "—"}</td>
            <td className="pr-3">
              <LeadStatusBadge status={l.status} />
            </td>
            {withActions && (
              <td>
                <LeadRowActions lead={l} token={token} onStatusChange={onStatusChange} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
