import { NextRequest } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params;
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";

  if (!token) {
    return new Response("unauthorized", { status: 401 });
  }
  if (table !== "users" && table !== "sites") {
    return new Response("invalid table", { status: 400 });
  }

  const url = `${NEST_API}/api/admin/sync/${table}/run`;
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      "x-admin-session": token,
      accept: "text/event-stream",
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
