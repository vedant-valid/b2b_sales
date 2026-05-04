const EXCLUDE_KEYS = new Set(["excludeTitleKeywords", "excludeIndustries"]);

export default function FilterPreview({ filters }) {
  if (!filters) return null;
  const entries = Object.entries(filters).filter(([, v]) => Array.isArray(v) ? v.length : v);
  return (
    <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
      {entries.map(([k, v]) => {
        const isExclude = EXCLUDE_KEYS.has(k);
        return (
          <div key={k}>
            <span className={`font-semibold ${isExclude ? "text-red-600" : ""}`}>{k}:</span>{" "}
            <span className={isExclude ? "text-red-700" : ""}>{Array.isArray(v) ? v.join(", ") : v}</span>
          </div>
        );
      })}
    </div>
  );
}
