import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

/** URL만으로 사이트 name·icon 조회 (AI 호출 없음). 값 검증은 서버(Nest)에서 한다. */
export async function GET(req: Request) {
  const store = await cookies();
  const token = store.get("admin_token")?.value ?? "";
  const url = new URL(req.url).searchParams.get("url") ?? "";

  const res = await fetch(
    `${NEST_API}/api/admin/sites/meta?url=${encodeURIComponent(url)}`,
    {
      headers: { "x-admin-session": token },
      cache: "no-store",
    },
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
