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

  const messages = {
    completed: "Done — leads loaded below",
    failed: "Something went wrong. Try running the campaign again.",
  };

  return (
    <div className={`text-sm ${job.state === "failed" ? "text-red-600" : "text-gray-500"}`}>
      {messages[job.state] ?? "Finding leads… this usually takes 20–30 seconds"}
      {job.retryCount > 0 && <span className="text-amber-600 ml-2">(retrying…)</span>}
    </div>
  );
}
