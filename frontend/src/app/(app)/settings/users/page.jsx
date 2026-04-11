"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function UsersAdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", role: "VIEWER", name: "" });
  const [error, setError] = useState("");
  const token = session?.backendToken;

  async function load() {
    if (!token) return;
    try { const { users } = await apiFetch("/api/users", { token }); setUsers(users); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [token]);

  async function onCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/users", { token, method: "POST", body: form });
      setForm({ email: "", password: "", role: "VIEWER", name: "" });
      load();
    } catch (e) { setError(e.message); }
  }

  if (session && session.user.role !== "ADMIN") return <p>Forbidden</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Users</h1>
      <form onSubmit={onCreate} className="flex gap-2 items-end">
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border p-2 rounded" />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border p-2 rounded" />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border p-2 rounded" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border p-2 rounded">
          <option>ADMIN</option><option>MANAGER</option><option>VIEWER</option>
        </select>
        <button className="bg-black text-white px-4 py-2 rounded">Add</button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Email</th><th>Name</th><th>Role</th></tr></thead>
        <tbody>{users.map((u) => <tr key={u.id} className="border-b"><td>{u.email}</td><td>{u.name}</td><td>{u.role}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
