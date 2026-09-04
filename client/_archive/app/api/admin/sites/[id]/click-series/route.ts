import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const store = await cookies();
    const token = store.get("admin_token")?.value ?? "";
    const days = req.nextUrl.searchParams.get("days") ?? "7";

    const res = await fetch(
      `${NEST_API}/api/admin/sites/${id}/click-series?days=${days}`,
      { headers: { "x-admin-session": token }, cache: "no-store" },
    );
    const data = await res.json().catch(() => ({ series: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ series: [] }, { status: 503 });
  }
}
