const STATUS_CONFIG = {
  NEW:            { label: "New",            cls: "bg-gray-100 text-gray-600" },
  CONTACTED:      { label: "Contacted",      cls: "bg-blue-100 text-blue-700" },
  REPLIED:        { label: "Replied",        cls: "bg-purple-100 text-purple-700" },
  INTERESTED:     { label: "Interested",     cls: "bg-green-100 text-green-700" },
  NOT_INTERESTED: { label: "Not Interested", cls: "bg-red-100 text-red-600" },
  NEUTRAL:        { label: "Neutral",        cls: "bg-amber-100 text-amber-700" },
  CONVERTIBLE:    { label: "Convertible",    cls: "bg-teal-100 text-teal-700" },
  SKIPPED:        { label: "Irrelevant",     cls: "bg-orange-100 text-orange-600" },
};

export default function LeadStatusBadge({ status }) {
  const { label, cls } = STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}
