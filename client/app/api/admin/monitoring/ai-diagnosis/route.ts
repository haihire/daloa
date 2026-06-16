import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  try {
    const res = await fetch(`${NEST_API}/api/admin/monitoring/ai-diagnosis`, {
      headers: { "x-admin-session": token },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "AI 진단 요청에 실패했습니다." },
      { status: 503 },
    );
  }
}
