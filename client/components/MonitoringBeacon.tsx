"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function classifyDevice(userAgent: string): "mobile" | "desktop" | "tablet" | "bot" | "unknown" {
  const ua = userAgent.toLowerCase();
  if (/bot|crawler|spider|googlebot|bingbot/.test(ua)) return "bot";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "unknown";
}

function countryFromLocale(locale: string): string | null {
  const m = locale.match(/[-_](\w{2})$/i);
  if (!m) return null;
  return m[1].toUpperCase();
}

async function send(payload: unknown) {
  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // best-effort telemetry
  }
}

export default function MonitoringBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    const userAgent = navigator.userAgent ?? "";
    const localeCountry =
      countryFromLocale(navigator.language || "") ||
      (Array.isArray(navigator.languages) ? countryFromLocale(navigator.languages[0] || "") : null);
    send({
      type: "page-visit",
      path: pathname,
      deviceType: classifyDevice(userAgent),
      userAgent,
      referrer: document.referrer || null,
      localeCountry,
    });
  }, [pathname]);

  return null;
}
