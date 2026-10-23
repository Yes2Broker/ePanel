"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePathFor, useSession } from "@/context/session-context";

export default function RootPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? homePathFor(user) : "/login");
  }, [loading, user, router]);

  return null;
}
