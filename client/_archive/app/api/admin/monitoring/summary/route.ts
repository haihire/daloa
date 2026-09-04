import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET() {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const res = await fetch(`${NEST_API}/api/admin/monitoring/summary`, {
    headers: { "x-admin-session": token },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
