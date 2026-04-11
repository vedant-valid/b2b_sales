import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen">
      <header className="border-b p-4 flex justify-between">
        <span className="font-bold">Outreach</span>
        <span className="text-sm text-gray-600">{session.user.email} · {session.user.role}</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
