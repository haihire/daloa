import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  try {
    const store = await cookies();
    const token = store.get("admin_token")?.value ?? "";
    const query = req.nextUrl.searchParams.toString();

    const res = await fetch(
      `${NEST_API}/api/admin/inven/site-candidates${query ? `?${query}` : ""}`,
      { headers: { "x-admin-session": token }, cache: "no-store" },
    );
    const data = await res.json().catch(() => ({ candidates: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ candidates: [] }, { status: 503 });
  }
}
