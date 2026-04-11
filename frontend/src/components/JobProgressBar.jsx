"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function JobProgressBar({ jobId }) {
  const { data: session } = useSession();
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!jobId || !session?.backendToken) return;
    let cancelled = false;
    async function poll() {
      try {
        const { job } = await apiFetch(`/api/jobs/${jobId}`, { token: session.backendToken });
        if (cancelled) return;
        setJob(job);
        if (job.state !== "completed" && job.state !== "failed") setTimeout(poll, 2000);
      } catch { /* ignore */ }
    }
    poll();
    return () => { cancelled = true; };
  }, [jobId, session?.backendToken]);

  if (!job) return <p className="text-sm text-gray-500">Queuing…</p>;
  return (
    <div className="text-sm">
      <span>Job {job.name}: </span>
      <span className="font-semibold">{job.state}</span>
      {job.retryCount > 0 && <span className="text-amber-700"> (retry {job.retryCount})</span>}
    </div>
  );
}
