import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-sm text-center">
        <p className="text-5xl font-semibold text-ink">404</p>
        <h1 className="mt-3 text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-1.5 text-sm text-ink-faint">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <Link href="/" className="mt-5 inline-flex rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90">Go to my dashboard</Link>
      </div>
    </div>
  );
}
