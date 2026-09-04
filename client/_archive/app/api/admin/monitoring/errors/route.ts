import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: Request) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(
      `${NEST_API}/api/admin/monitoring/errors${qs ? `?${qs}` : ""}`,
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
