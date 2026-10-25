"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api-client";

interface Me {
  user: { id: string; name: string; isAdmin: boolean };
}

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/questions", label: "Question bank" },
  { href: "/admin/daily-quiz", label: "Daily quiz" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    api
      .get<Me>("/api/auth/me")
      .then((data) => {
        if (data.user.isAdmin) {
          setStatus("ok");
        } else {
          setStatus("denied");
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setStatus("denied");
      });
  }, [router]);

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (status === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admins only</h1>
        <p className="max-w-sm text-sm text-slate-500">
          This area is for managing the Daily Brain Challenge question bank and isn&apos;t available on your
          account.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="text-lg font-semibold text-indigo-700">
            StudyPlan Analyzer · Admin
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link href="/dashboard" className="ml-2 text-sm text-slate-400 hover:text-slate-700">
              Exit admin
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
