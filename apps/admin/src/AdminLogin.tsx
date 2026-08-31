import { useEffect } from "react";
import { wasAccessDenied } from "./providers.js";

export function AdminLogin() {
  const denied = wasAccessDenied();
  useEffect(() => {
    if (denied) return;
    const siteUrl = import.meta.env.VITE_SITE_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : "https://makeitastory.app");
    window.location.replace(`${siteUrl.replace(/\/+$/, "")}/sign-in?continue=admin`);
  }, [denied]);
  return denied ? <main className="admin-login"><h1>Доступ запрещён / Access denied</h1></main>
    : <main className="admin-login" aria-busy="true">Redirecting to sign in…</main>;
}
