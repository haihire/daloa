export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

export function event(
  action: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", action, params);
}
