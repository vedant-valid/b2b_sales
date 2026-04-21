import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/leads", label: "Leads" },
  { href: "/replies", label: "Replies" },
  { href: "/export", label: "Export" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center bg-white">
        <span className="font-bold text-lg">Outreach</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{session.user.email} · {session.user.role}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1">
        <nav className="w-48 border-r bg-gray-50 p-4 space-y-1 shrink-0">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href}
              className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-200">
              {label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
