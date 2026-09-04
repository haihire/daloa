import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

/** URL에 대해 AI로 category·description 추천. 버튼 클릭 시에만 호출된다(토큰 보호). */
export async function POST(req: Request) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${NEST_API}/api/admin/sites/suggest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-session": token,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
