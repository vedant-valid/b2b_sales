"use client";
import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function AuthWatcher() {
  useEffect(() => {
    const handler = () => signOut({ callbackUrl: "/login" });
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, []);
  return null;
}
