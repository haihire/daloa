import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  // 달력(from~to) 기준. 빈 값은 nest가 오늘 하루로 폴백.
  const sp = req.nextUrl.searchParams;
  const qs = new URLSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  try {
    const res = await fetch(
      `${NEST_API}/api/admin/monitoring/page-load-series?${qs.toString()}`,
      { headers: { "x-admin-session": token }, cache: "no-store" },
    );
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
