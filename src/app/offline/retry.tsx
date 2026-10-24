"use client";

export function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="mt-6 min-h-11 rounded-xl bg-ink px-6 text-sm font-medium text-white hover:bg-ink/90"
    >
      Try again
    </button>
  );
}
