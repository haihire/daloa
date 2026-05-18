import { NextRequest } from "next/server";
import { cookies } from "next/headers";
const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params;
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  const direction = req.nextUrl.searchParams.get("direction")?.trim() ?? "";
  const store = await cookies();
  const localSession = store.get("admin_token")?.value ?? "";

  if (!sessionId) {
    return new Response("missing remote session", { status: 401 });
  }
  if (table !== "users" && table !== "sites") {
    return new Response("invalid table", { status: 400 });
  }
  if (direction !== "local-to-prod" && direction !== "prod-to-local") {
    return new Response("invalid direction", { status: 400 });
  }

  const url =
    `${NEST_API}/api/admin/sync/${table}/run` +
    `?sessionId=${encodeURIComponent(sessionId)}` +
    `&direction=${encodeURIComponent(direction)}`;
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      ...(localSession ? { "x-admin-session": localSession } : {}),
    },
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || "upstream error", { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
