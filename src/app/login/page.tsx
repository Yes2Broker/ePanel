"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useSession } from "@/context/session-context";
import { employees } from "@/data/employees";

export default function LoginPage() {
  const { login, loginAs } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const demoAccounts = [
    employees.find((e) => e.id === "EMP001")!,
    employees.find((e) => e.id === "EMP002")!,
    employees.find((e) => e.id === "EMP003")!,
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const match = login(email);
    if (!match) {
      setError("No matching account. Try one of the demo accounts below.");
      return;
    }
    router.push("/dashboard");
  };

  const handleDemoLogin = (id: string) => {
    const acc = employees.find((emp) => emp.id === id);
    if (acc) {
      loginAs(acc);
      router.push("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 h-12 w-12 overflow-hidden rounded-2xl bg-white shadow-card">
            <Image src="/assets/logo.webp" alt="Yes2Broker" width={48} height={48} className="h-full w-full object-cover" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Yes2Broker</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Employee Panel</p>
        </div>

        <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yes2broker.com"
                className="w-full rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && <p className="text-xs text-status-danger">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-xl bg-ink px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-2"
            >
              Log in
            </button>
          </form>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-faint">
            <Lock className="h-3 w-3" /> Need to reset your password? Contact HR or Admin.
          </p>
        </div>

        <div className="mt-6 rounded-card border border-surface-border bg-white p-4 shadow-card">
          <p className="mb-2.5 text-xs font-medium text-ink-muted">Demo accounts (prototype only)</p>
          <div className="space-y-1">
            {demoAccounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => handleDemoLogin(acc.id)}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-ink hover:bg-surface"
              >
                <span>{acc.name}</span>
                <span className="text-xs text-ink-faint">{acc.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
