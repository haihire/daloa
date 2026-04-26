export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

type GtagCommand = "config" | "event" | "js";

declare global {
  interface Window {
    gtag: (command: GtagCommand, target: string, params?: Record<string, unknown>) => void;
    dataLayer: unknown[];
  }
}

export function trackEvent(
  action: string,
  params?: Record<string, unknown>,
): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", action, params);
}
