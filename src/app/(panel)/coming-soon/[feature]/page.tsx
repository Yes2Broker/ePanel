"use client";

import { useParams } from "next/navigation";
import { ComingSoonPage } from "@/components/feature/coming-soon";
import { FEATURES, FeatureKey } from "@/lib/features";

export default function ComingSoonRoute() {
  const { feature } = useParams<{ feature: string }>();
  return <ComingSoonPage feature={feature in FEATURES ? (feature as FeatureKey) : null} />;
}
