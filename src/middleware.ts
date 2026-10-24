import { NextRequest, NextResponse } from "next/server";
import { featureForPath, isFeatureEnabled } from "@/lib/features";

// Pages of features that are switched off (src/lib/features.ts) are served
// the "Coming soon" page instead, whatever URL is typed — including
// sub-pages and /admin/... variants that don't exist yet.
export function middleware(req: NextRequest) {
  const feature = featureForPath(req.nextUrl.pathname);
  if (!feature || isFeatureEnabled(feature)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/coming-soon/${feature}`;
  return NextResponse.rewrite(url);
}

// Must list every prefix in FEATURE_ROUTES (Next.js needs these as literals).
export const config = {
  matcher: [
    "/attendance/:path*", "/admin/attendance/:path*",
    "/leave/:path*", "/admin/leave/:path*",
    "/reports/:path*", "/admin/reports/:path*",
    "/tasks/:path*", "/admin/tasks/:path*",
  ],
};
