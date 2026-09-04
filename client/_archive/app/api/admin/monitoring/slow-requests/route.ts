import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const query = req.nextUrl.searchParams.toString();
  const res = await fetch(
    `${NEST_API}/api/admin/monitoring/slow-requests${query ? `?${query}` : ""}`,
    {
      headers: { "x-admin-session": token },
      cache: "no-store",
    },
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
