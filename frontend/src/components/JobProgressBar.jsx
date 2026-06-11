"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function JobProgressBar({ jobId, onComplete }) {
  const { data: session } = useSession();
  const [job, setJob] = useState(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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
        }
      } catch { /* ignore */ }
    }
    poll();
    return () => { cancelled = true; };
  }, [jobId, session?.backendToken]);

  if (!job) return <p className="text-sm text-gray-500 animate-pulse">Finding leads… this usually takes 20–30 seconds</p>;

  if (job.state === "failed") {
    const raw = job.output?.message ?? "";
    const isLushaLimit = raw.includes("credit limit") || raw.includes("402");
    const detail = isLushaLimit
      ? "Lusha search quota reached — upgrade your Lusha account and try again."
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
