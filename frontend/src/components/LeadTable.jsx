"use client";
import Link from "next/link";
import LeadStatusBadge from "./LeadStatusBadge";
import LeadRowActions from "./LeadRowActions";

function CompanyAvatar({ company }) {
  const letter = (company || "?")[0].toUpperCase();
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-green-100 text-green-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
  ];
  const idx = (company || "?").charCodeAt(0) % colors.length;
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${colors[idx]}`}>
      {letter}
    </span>
  );
}

export default function LeadTable({ leads, token, onStatusChange }) {
  const withActions = token && onStatusChange;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b text-gray-500 text-xs uppercase tracking-wide">
          <th className="pb-1 pr-2 w-8"></th>
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
            <td className="py-2 pr-2">
              <CompanyAvatar company={l.company} />
            </td>
            <td className="py-2 pr-3">
              <Link className="underline" href={`/leads/${l.id}`}>
                {l.firstName} {l.lastName}
              </Link>
            </td>
            <td className="pr-3">{l.title ?? "—"}</td>
            <td className="pr-3">{l.company ?? "—"}</td>
            <td className="pr-3">
              {l.email
                ? l.email
                : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Not unlocked</span>
              }
            </td>
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
