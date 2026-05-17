import { NextResponse } from "next/server";

const SYNC_TARGET_API =
  process.env.SYNC_TARGET_API_URL ??
  process.env.NEXT_PUBLIC_SYNC_TARGET_API_URL ??
  "https://api.daloa.kr";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { username?: string; password?: string };

  if (!body.username || !body.password) {
    return NextResponse.json(
      { message: "아이디와 비밀번호를 입력해주세요." },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${SYNC_TARGET_API}/api/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await upstream.json().catch(() => ({}))) as {
    sessionId?: string;
    role?: string;
    message?: string;
  };

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data.message ?? "원격 관리자 인증에 실패했습니다." },
      { status: upstream.status },
    );
  }

  if (!data.sessionId) {
    return NextResponse.json(
      { message: "원격 세션 정보를 받지 못했습니다." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sessionId: data.sessionId,
    role: data.role,
  });
}
