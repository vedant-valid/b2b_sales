"use client";
import { useState } from "react";

const FIELDS = [
  { key: "locations",            label: "Locations",            hint: "e.g. India, United States" },
  { key: "companySizes",         label: "Company sizes",        hint: "e.g. 11-50, 51-200" },
  { key: "seniorities",          label: "Seniority levels",     hint: "e.g. c-suite, director, manager" },
  { key: "departments",          label: "Departments",          hint: "e.g. Engineering & Technical, Product" },
  { key: "titleKeywords",        label: "Job title keywords",   hint: "e.g. cto, head of engineering" },
  { key: "excludeTitleKeywords", label: "Exclude job titles",   hint: "e.g. ciso, security" },
  { key: "excludeIndustries",    label: "Exclude industries",   hint: "e.g. Hospitality, Healthcare" },
];

function toArray(str) {
  return str.split(",").map(s => s.trim()).filter(Boolean);
}

function fromArray(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

export default function FilterEditor({ initialFilters, onRerun, rerunning }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map(f => [f.key, fromArray(initialFilters?.[f.key] ?? [])]))
  );
  const [error, setError] = useState("");

  function handleSubmit() {
    setError("");
    const filters = {};
    for (const { key } of FIELDS) {
      const arr = toArray(values[key]);
      if (arr.length > 0) filters[key] = arr;
    }
    if (Object.keys(filters).length === 0) {
      setError("Add at least one filter before re-running.");
      return;
    }
    onRerun(filters);
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label className={`block text-xs font-medium mb-1 ${key.startsWith("exclude") ? "text-red-600" : "text-gray-600"}`}>
              {label}
            </label>
            <input
              type="text"
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              placeholder={hint}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={rerunning}
        className="bg-purple-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
      >
        {rerunning ? "Re-running…" : "Re-run with these filters"}
      </button>
    </div>
  );
}
