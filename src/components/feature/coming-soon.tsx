import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FEATURE_KEYS, FEATURES, FeatureKey, isFeatureEnabled } from "@/lib/features";

/** Badge used next to anything that isn't launched yet. */
export function ComingSoonBadge() {
  return <span className="shrink-0 whitespace-nowrap rounded-full bg-status-neutralBg px-2 py-0.5 text-[11px] font-normal text-ink-muted">Coming soon</span>;
}

/** Full-page placeholder for a feature that's switched off. */
export function ComingSoonPage({ feature }: { feature: FeatureKey | null }) {
  const label = feature ? FEATURES[feature].label : "This page";
  return (
    <div className="flex min-h-[60vh] items-center justify-center pt-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand">
          <Sparkles className="h-5 w-5 text-ink" />
        </div>
        <h1 className="text-xl font-semibold text-ink">{label} is coming soon</h1>
        <p className="mt-1.5 text-sm text-ink-faint">We&apos;re getting this ready. It will appear here as soon as it&apos;s launched.</p>
      </div>
    </div>
  );
}

/** Small dashboard card listing the features that aren't launched yet. Renders nothing once all are live. */
export function ComingSoonCard() {
  const pending = FEATURE_KEYS.filter((k) => !isFeatureEnabled(k));
  if (pending.length === 0) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand">
        <Sparkles className="h-4 w-4 text-ink" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Coming soon</p>
        <p className="text-sm text-ink-faint">{pending.map((k) => FEATURES[k].label).join(", ")} will appear here once launched.</p>
      </div>
    </Card>
  );
}
