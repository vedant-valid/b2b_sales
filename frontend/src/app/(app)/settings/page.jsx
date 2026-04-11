const DELIVERABILITY_ITEMS = [
  { id: "domain", label: "Separate sending domain configured in Instantly.ai (e.g. recruit-nst.com)" },
  { id: "spf", label: "SPF record added to sending domain DNS" },
  { id: "dkim", label: "DKIM record added to sending domain DNS" },
  { id: "dmarc", label: "DMARC policy set on sending domain DNS" },
  { id: "warmup", label: "4-week inbox warm-up completed in Instantly.ai" },
  { id: "cap", label: "Daily send volume capped at 30–50 emails/mailbox" }
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Deliverability checklist</h2>
        <p className="text-sm text-gray-600">
          Complete every item before launching your first campaign. These are manual steps — use them as reference.
        </p>
        <ul className="space-y-2">
          {DELIVERABILITY_ITEMS.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          Docs: see Instantly.ai domain + warm-up setup guides.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">API keys</h2>
        <p className="text-sm text-gray-600">
          Gemini, Lusha, and Instantly.ai keys are configured via backend environment variables.
          Admin-only UI for runtime updates is out of scope for v1.
        </p>
      </section>
    </div>
  );
}
