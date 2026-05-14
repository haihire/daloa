import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function POST() {
  const store = await cookies();
  const sessionId = store.get("admin_token")?.value ?? "";

  if (sessionId) {
    await fetch(`${NEST_API}/api/admin/auth/logout`, {
      method: "POST",
      headers: { "x-admin-session": sessionId },
    }).catch(() => {}); // 세션 삭제 실패해도 쿠키는 제거
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
