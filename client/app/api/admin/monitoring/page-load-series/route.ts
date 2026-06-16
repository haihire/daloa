import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const days = req.nextUrl.searchParams.get("days") ?? "7";
  try {
    const res = await fetch(
      `${NEST_API}/api/admin/monitoring/page-load-series?days=${encodeURIComponent(days)}`,
      { headers: { "x-admin-session": token }, cache: "no-store" },
    );
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
