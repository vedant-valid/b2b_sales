"use client";
import { useState } from "react";

const FILTERS = [
  { label: "All",         value: null },
  { label: "Replied",     value: "REPLIED" },
  { label: "Interested",  value: "INTERESTED" },
  { label: "Convertible", value: "CONVERTIBLE" },
];

export default function LeadList({ leads, selectedId, onSelect }) {
  const [filter, setFilter] = useState(null);
  const filtered = filter ? leads.filter(l => l.status === filter) : leads;

  return (
    <div className="w-64 border-r flex flex-col flex-shrink-0 bg-gray-50">
      <div className="p-3 border-b space-y-2">
        <h2 className="font-semibold text-sm">Conversations</h2>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => setFilter(f.value)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                filter === f.value
                  ? "bg-black text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 p-4">No conversations match this filter.</p>
        )}
        {filtered.map(lead => (
          <button
            key={lead.id}
            onClick={() => onSelect(lead.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-white transition-colors ${
              selectedId === lead.id
                ? "bg-white border-l-2 border-l-black"
                : "border-l-2 border-l-transparent"
            }`}
          >
            <div className="flex justify-between items-start gap-1">
              <span className="font-medium text-sm truncate">{lead.firstName} {lead.lastName}</span>
              <span className="text-xs text-gray-400 shrink-0">{lead.company}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{lead.status}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
