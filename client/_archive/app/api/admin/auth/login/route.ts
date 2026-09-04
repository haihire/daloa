import { NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function POST(req: Request) {
  const body = (await req.json()) as { username?: string; password?: string };

  let upstream: Response;
  try {
    upstream = await fetch(`${NEST_API}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "관리자 서버(3001)에 연결할 수 없습니다. Nest가 실행 중인지 확인해주세요.",
      },
      { status: 503 },
    );
  }

  const data = (await upstream.json()) as {
    sessionId?: string;
    role?: string;
    message?: string;
  };

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data.message ?? "인증에 실패했습니다." },
      { status: upstream.status },
    );
  }

  const res = NextResponse.json({ role: data.role });
  const cookieBase = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };

  res.cookies.set("admin_token", data.sessionId ?? "", {
    ...cookieBase,
    httpOnly: true,
  });
  res.cookies.set("admin_role", data.role ?? "", {
    ...cookieBase,
    httpOnly: false,
  });
  return res;
}
