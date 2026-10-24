"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { homePathFor, useSession } from "@/context/session-context";
import { errorMessage } from "@/lib/api";
import { FullLogo, LogoIcon } from "@/components/ui/logo";

export default function LoginPage() {
  const { user, loading, login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — skip the form.
  useEffect(() => {
    if (!loading && user) router.replace(homePathFor(user));
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const employee = await login(email, password);
      router.replace(homePathFor(employee));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Branding panel — desktop only */}
      <div className="relative hidden overflow-hidden border-r border-surface-border bg-white lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #273992 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative flex w-full max-w-md flex-col items-center px-10">
          <FullLogo className="mb-8" priority />
          <p className="max-w-xs text-center text-sm leading-relaxed text-ink-muted">
            One panel for everything your team needs, in one place.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <LogoIcon size={64} className="rounded-2xl shadow-card" />
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h1 className="text-xl font-semibold text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-ink-faint">Sign in to your employee panel.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-ink-muted">Email or employee code</label>
              <input
                id="email"
                type="text"
                required
                autoFocus
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com or EMP001"
                className="min-h-12 w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-base text-ink sm:min-h-11 sm:text-sm placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-muted">Password</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="min-h-12 w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-base text-ink sm:min-h-11 sm:text-sm placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && <p className="text-xs text-status-danger" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="min-h-12 w-full rounded-xl bg-ink px-3.5 py-2.5 text-base font-medium text-white sm:min-h-11 sm:text-sm transition-colors hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-2 disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-faint lg:justify-start">
            <Lock className="h-3 w-3" /> Forgot your password? Contact HR or Admin to reset it.
          </p>
        </div>
      </div>
    </div>
  );
}
