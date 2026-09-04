import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const store = await cookies();
    const token = store.get("admin_token")?.value ?? "";

    const res = await fetch(
      `${NEST_API}/api/admin/inven/site-candidates/${id}/suggest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-session": token },
        cache: "no-store",
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "upstream unavailable" }, { status: 503 });
  }
}
