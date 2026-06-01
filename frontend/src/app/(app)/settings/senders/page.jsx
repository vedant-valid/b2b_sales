"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function SendersPage() {
  const { data: session } = useSession();
  const [senders, setSenders] = useState([]);
  const [users, setUsers] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const token = session?.backendToken;

  async function load() {
    if (!token) return;
    try {
      const [{ senders }, { users }] = await Promise.all([
        apiFetch("/api/sender-accounts", { token }),
        apiFetch("/api/users", { token })
      ]);
      setSenders(senders);
      setUsers(users);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, [token]);

  async function onSync() {
    setSyncing(true); setError(""); setSyncMsg("");
    try {
      const { synced } = await apiFetch("/api/sender-accounts/sync", { token, method: "POST" });
      setSyncMsg(`Synced ${synced} accounts from Instantly.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  }

  async function onAssign(senderEmail, userId) {
    if (!userId) return;
    try {
      await apiFetch(`/api/sender-accounts/${encodeURIComponent(senderEmail)}/assign`, {
        token, method: "POST", body: { userId }
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function onUnassign(senderEmail, userId) {
    try {
      await apiFetch(`/api/sender-accounts/${encodeURIComponent(senderEmail)}/assign/${userId}`, {
        token, method: "DELETE"
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  if (session?.user?.role !== "ADMIN") return <p className="text-red-600">Forbidden</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sender Accounts</h1>
        <button
          onClick={onSync}
          disabled={syncing}
          className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync from Instantly"}
        </button>
      </div>

      {syncMsg && <p className="text-green-700 text-sm">{syncMsg}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {senders.length === 0 ? (
        <p className="text-gray-500 text-sm">No sender accounts synced yet. Click Sync to pull from Instantly.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Email</th>
              <th className="py-2">Status</th>
              <th className="py-2">Assigned To</th>
              <th className="py-2">Add Assignment</th>
            </tr>
          </thead>
          <tbody>
            {senders.map((s) => (
              <tr key={s.email} className="border-b">
                <td className="py-2 font-mono text-xs">{s.email}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    s.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {s.status ?? "unknown"}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {s.assignments.map(a => (
                      <span key={a.user.id} className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {a.user.name || a.user.email}
                        <button
                          onClick={() => onUnassign(s.email, a.user.id)}
                          className="text-gray-400 hover:text-red-600 ml-1"
                        >×</button>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2">
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { onAssign(s.email, e.target.value); e.target.value = ""; } }}
                    className="border p-1 rounded text-xs"
                  >
                    <option value="">+ Assign user…</option>
                    {users
                      .filter(u => !s.assignments.some(a => a.user.id === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))
                    }
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
