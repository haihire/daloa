import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

function detectOs(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("linux")) return "Linux";
  return "Unknown";
}

function detectBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("chrome/") && !ua.includes("edg/") && !ua.includes("opr/")) return "Chrome";
  if (ua.includes("safari/") && !ua.includes("chrome/")) return "Safari";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("msie") || ua.includes("trident/")) return "IE";
  return "Unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userAgent =
    (typeof body?.userAgent === "string" && body.userAgent) ||
    req.headers.get("user-agent") ||
    "";
  const country =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("x-country-code") ||
    req.headers.get("cf-ipcountry") ||
    (typeof body?.localeCountry === "string" ? body.localeCountry.toUpperCase() : null) ||
    "UNKNOWN";
  const osName = (typeof body?.osName === "string" && body.osName) || detectOs(userAgent);
  const browserName = (typeof body?.browserName === "string" && body.browserName) || detectBrowser(userAgent);

  const enrichedBody = {
    ...body,
    userAgent,
    countryCode: country,
    osName,
    browserName,
  };
  const endpoint =
    body?.type === "page-visit"
      ? "/api/telemetry/page-visit"
      : body?.type === "request"
        ? "/api/telemetry/request"
        : body?.type === "site-click"
          ? "/api/telemetry/site-click"
          : body?.type === "youtube-click"
            ? "/api/telemetry/youtube-click"
        : null;

  if (!endpoint) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const res = await fetch(`${NEST_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enrichedBody),
  });

  return NextResponse.json(await res.json().catch(() => ({})), {
    status: res.status,
  });
}
