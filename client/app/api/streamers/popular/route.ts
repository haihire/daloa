import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const offset = searchParams.get("offset") ?? "0";
  const limit = searchParams.get("limit") ?? "0";
  // 캐시버스터(_): 관리자 화면이 삭제를 즉시 반영하려고 붙이는 값.
  // 이게 있으면 이 라우트의 Next Data Cache까지 우회해 오리진 최신을 받는다.
  // (없으면 Vercel 엣지는 뚫려도 라우트 내부 캐시가 stale을 돌려줘 삭제가 안 보임)
  const fresh = searchParams.has("_");

  const upstream = `${NEST_API}/api/streamers/popular?offset=${offset}&limit=${limit}`;

  const res = await fetch(
    upstream,
    fresh ? { cache: "no-store" } : { next: { revalidate: 300 } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { items: [], hasMore: false, nextOffset: null },
      { status: res.status },
    );
  }

  const data: unknown = await res.json();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": fresh ? "no-store" : "public, s-maxage=300",
    },
  });
}
