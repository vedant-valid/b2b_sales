"use client";
import { useState } from "react";
import Link from "next/link";

function ScoreBadge({ score }) {
  if (score == null) {
    return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">No score</span>;
  }
  const color =
    score >= 70 ? "bg-green-100 text-green-800" :
    score >= 40 ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${color}`}>
      {score}
    </span>
  );
}

function ReasoningCell({ bullets }) {
  const [open, setOpen] = useState(false);
  if (!bullets || bullets.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 underline"
      >
        {open ? "▲ Hide" : "▼ Show"}
      </button>
      {open && (
        <ul className="mt-1 text-xs text-gray-700 list-disc list-inside space-y-0.5">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function LeadApprovalTable({ leads, skippedIds, onSkip, onUndoSkip, rowError }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-1 pr-3">Name</th>
            <th className="pr-3">Title</th>
            <th className="pr-3">Company</th>
            <th className="pr-3">Score</th>
            <th className="pr-3">Fit Reasoning</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const skipped = skippedIds.has(l.id);
            return (
              <tr
                key={l.id}
                className={`border-b transition-opacity ${skipped ? "opacity-40" : "hover:bg-gray-50"}`}
              >
                <td className="py-2 pr-3">
                  <Link className="underline" href={`/leads/${l.id}`}>
                    {l.firstName} {l.lastName}
                  </Link>
                </td>
                <td className="pr-3">{l.title ?? "—"}</td>
                <td className="pr-3">{l.company ?? "—"}</td>
                <td className="pr-3"><ScoreBadge score={l.fitScore} /></td>
                <td className="pr-3 max-w-xs"><ReasoningCell bullets={l.fitReasoning} /></td>
                <td>
                  {skipped ? (
                    <button
                      onClick={() => onUndoSkip(l.id)}
                      className="text-xs text-blue-600 underline"
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      onClick={() => onSkip(l.id)}
                      className="text-xs text-red-600 underline"
                    >
                      Skip
                    </button>
                  )}
                  {rowError?.[l.id] && (
                    <span className="text-xs text-red-500 ml-2">{rowError[l.id]}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
