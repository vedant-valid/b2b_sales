import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import AuthWatcher from "@/components/AuthWatcher";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center bg-card">
        <span className="font-bold text-lg tracking-tight">Outreach</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {session.user.email} · {session.user.role}
          </span>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <AuthWatcher />
          {children}
        </main>
      </div>
    </div>
  );
}
