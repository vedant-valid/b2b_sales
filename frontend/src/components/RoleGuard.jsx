"use client";
import { useSession } from "next-auth/react";

export default function RoleGuard({ roles, children, fallback = null }) {
  const { data: session } = useSession();
  if (!session || !roles.includes(session.user.role)) return fallback;
  return children;
}
