import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const body = await req.text();
  try {
    const res = await fetch(`${NEST_API}/api/admin/monitoring/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-session": token,
      },
      body,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "AI 챗봇 요청에 실패했습니다." },
      { status: 503 },
    );
  }
}
