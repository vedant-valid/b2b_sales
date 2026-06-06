"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) setError("Invalid credentials");
    else router.push("/dashboard");
  }

  async function signInAsDemo() {
    setDemoLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email: "manager@reachout.dev",
      password: "Admin1234!",
      redirect: false,
    });
    if (res?.error) {
      setError("Demo account unavailable");
      setDemoLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded" required />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button className="flex-1 bg-black text-white p-2 rounded">Sign in</button>
          <button
            type="button"
            onClick={signInAsDemo}
            disabled={demoLoading}
            className="flex-1 border border-black text-black p-2 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {demoLoading ? "Signing in…" : "Try as Manager"}
          </button>
        </div>
      </form>
    </main>
  );
}
