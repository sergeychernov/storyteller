import { analytics } from "@storyteller/analytics";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { publicPages } from "./components/public/public-site-model.js";

const publicPaths = new Set(publicPages.map(({ page }) => page.path));

export function useSiteAnalytics(profileId: string | undefined): void {
  const { pathname } = useLocation();

  useEffect(() => analytics.setUser(profileId), [profileId]);
  useEffect(() => analytics.trackPage(resolveSitePage(pathname)), [pathname]);
}

function resolveSitePage(pathname: string): string {
  if (publicPaths.has(pathname)) return `public:${pathname}`;
  if (pathname === "/sign-in") return "sign-in";
  if (pathname === "/app") return "product-chooser";
  return "not-found";
}
