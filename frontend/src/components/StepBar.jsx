const STEPS = ["Setup", "Find Leads", "Review Leads", "Send Emails", "Done"];

function statusToStep(status) {
  const map = {
    DRAFT: 1,
    RUNNING: 2,
    AWAITING_LEAD_SELECTION: 3,
    AWAITING_LEAD_APPROVAL: 4,
    AWAITING_EMAIL_APPROVAL: 4,
    READY_FOR_OUTREACH: 4,
    PAUSED: null,
    COMPLETED: 5,
  };
  return map[status] ?? 1;
}

export default function StepBar({ status }) {
  const current = statusToStep(status);
  const isPaused = status === "PAUSED";

  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const done = current !== null && stepNum < current;
        const active = !isPaused && stepNum === current;

        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done   ? "bg-black text-white" :
                active ? "bg-black text-white ring-2 ring-black ring-offset-2" :
                         "bg-gray-200 text-gray-400"
              }`}>
                {done ? "✓" : stepNum}
              </div>
              <span className={`text-xs whitespace-nowrap ${active ? "font-semibold text-black" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? "bg-black" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
      {isPaused && (
        <span className="ml-3 text-xs text-orange-600 font-medium shrink-0">Paused</span>
      )}
    </div>
  );
}
