"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Image from "next/image";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: "/icon-dashboard.png" },
  { href: "/campaigns",  label: "Campaigns",  icon: "/icon-campaigns.png" },
  { href: "/leads",      label: "Leads",      icon: "/icon-leads.png" },
  { href: "/replies",    label: "Replies",    icon: "/icon-replies.png" },
  { href: "/export",     label: "Export",     icon: "/icon-export.png" },
  { href: "/settings",   label: "Settings",   icon: "/icon-settings.png" },
  { href: "/settings/senders", label: "Senders", icon: "/icon-settings.png", adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/auth/me", { token: session.backendToken })
      .then(({ user }) => setCredits(user.credits))
      .catch(() => {});
  }, [session?.backendToken]);

  return (
    <nav className="w-52 border-r bg-gray-50 flex flex-col shrink-0">
      <div className="flex-1 p-3 space-y-0.5 pt-4">
        {NAV.filter(item => !item.adminOnly || session?.user?.role === "ADMIN").map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-white border-l-2 border-black font-semibold text-black shadow-sm"
                  : "text-gray-600 hover:bg-gray-200 border-l-2 border-transparent"
              }`}
            >
              <Image src={icon} alt={label} width={20} height={20} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
      {credits !== null && (
        <div className="px-4 py-3 border-t text-xs text-gray-500">
          <span className="font-medium text-gray-700">{credits}</span> credits remaining
        </div>
      )}
    </nav>
  );
}
