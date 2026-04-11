const COLORS = {
  INTERESTED: "bg-green-100 text-green-800",
  NOT_INTERESTED: "bg-red-100 text-red-800",
  NEUTRAL: "bg-gray-100 text-gray-800",
  CONVERTIBLE: "bg-blue-100 text-blue-800"
};

export default function SentimentBadge({ sentiment }) {
  if (!sentiment) return null;
  return (
    <span className={`text-xs px-2 py-1 rounded ${COLORS[sentiment] || COLORS.NEUTRAL}`}>
      {sentiment}
    </span>
  );
}
