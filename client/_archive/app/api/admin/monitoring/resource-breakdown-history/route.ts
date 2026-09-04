import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: Request) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  // days=1|7 또는 from/to=YYYY-MM-DD — 값 검증은 서버(Nest)에서 한다.
  const src = new URL(req.url).searchParams;
  const params = new URLSearchParams();
  for (const key of ["days", "from", "to"]) {
    const v = src.get(key);
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  try {
    const res = await fetch(
      `${NEST_API}/api/admin/monitoring/resource-breakdown-history${qs ? `?${qs}` : ""}`,
      {
        headers: { "x-admin-session": token },
        cache: "no-store",
      },
    );
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
