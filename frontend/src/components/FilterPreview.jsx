export default function FilterPreview({ filters }) {
  if (!filters) return null;
  const entries = Object.entries(filters).filter(([, v]) => Array.isArray(v) ? v.length : v);
  return (
    <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
      {entries.map(([k, v]) => (
        <div key={k}><span className="font-semibold">{k}:</span> {Array.isArray(v) ? v.join(", ") : v}</div>
      ))}
    </div>
  );
}
