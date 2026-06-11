"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

function isLushaCreditLimit(message) {
  const raw = message ?? "";
  return raw.includes("credit limit") || raw.includes("402");
}

export default function JobProgressBar({ jobId, onComplete, onFailed }) {
  const { data: session } = useSession();
  const [job, setJob] = useState(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  useEffect(() => {
    if (!jobId || !session?.backendToken) return;
    let cancelled = false;
    async function poll() {
      try {
        const { job } = await apiFetch(`/api/jobs/${jobId}`, { token: session.backendToken });
        if (cancelled) return;
        setJob(job);
        if (job.state !== "completed" && job.state !== "failed") {
          setTimeout(poll, 2000);
        } else if (job.state === "completed") {
          onCompleteRef.current?.();
        } else if (job.state === "failed") {
          onFailedRef.current?.(isLushaCreditLimit(job.output?.message));
        }
      } catch { /* ignore */ }
    }
    poll();
    return () => { cancelled = true; };
  }, [jobId, session?.backendToken]);

  if (!job) return <p className="text-sm text-gray-500 animate-pulse">Finding leads… this usually takes 20–30 seconds</p>;

  if (job.state === "failed") {
    const raw = job.output?.message ?? "";
    const detail = isLushaCreditLimit(raw)
      ? "Lusha rejected this search with \"credit limit reached\", even though the account has a large credit balance remaining — Lusha returns this same message both when credits are exhausted and when an account or API key isn't provisioned for Prospecting/Search. Contact Lusha support to check this key's access before retrying; failed attempts still consume credits."
      : raw || "Something went wrong. Try running the campaign again.";
    return <p className="text-sm text-red-600">{detail}</p>;
  }

  if (job.state === "completed") {
    return <p className="text-sm text-gray-500">Done — leads loaded below</p>;
  }

  return (
    <div className="text-sm text-gray-500">
      Finding leads… this usually takes 20–30 seconds
      {job.retryCount > 0 && <span className="text-amber-600 ml-2">(retrying…)</span>}
    </div>
  );
}
