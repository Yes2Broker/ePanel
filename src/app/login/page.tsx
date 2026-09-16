"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useSession } from "@/context/session-context";

export default function LoginPage() {
  const { login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const match = await login(email, password);
    setSubmitting(false);
    if (!match) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Branding panel — desktop only */}
      <div className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative flex flex-col items-center">
          <div className="mb-6 h-20 w-20 overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10">
            <Image src="/assets/logo.webp" alt="Yes2Broker" width={80} height={80} className="h-full w-full object-cover" />
          </div>
          <p className="max-w-xs text-center text-sm leading-relaxed text-white/50">
            One panel for attendance, tasks, reports and everything your team needs — in one place.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex flex-col items-center lg:hidden">
            <div className="h-14 w-14 overflow-hidden rounded-2xl shadow-card">
              <Image src="/assets/logo.webp" alt="Yes2Broker" width={56} height={56} className="h-full w-full object-cover" />
            </div>
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h1 className="text-xl font-semibold text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-ink-faint">Sign in to your employee panel.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yes2broker.com"
                className="w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
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
                className="w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && <p className="text-xs text-status-danger">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-ink px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-2 disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-faint lg:justify-start">
            <Lock className="h-3 w-3" /> Need to reset your password? Contact HR or Admin.
          </p>
        </div>
      </div>
    </div>
  );
}
