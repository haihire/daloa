import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET() {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  try {
    const res = await fetch(`${NEST_API}/api/admin/monitoring/containers`, {
      headers: { "x-admin-session": token },
      cache: "no-store",
    });
    const data = await res
      .json()
      .catch(() => ({ containers: [], host: null, statuses: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { containers: [], host: null, statuses: [] },
      { status: 503 },
    );
  }
}
