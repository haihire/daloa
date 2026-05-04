import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const offset = searchParams.get("offset") ?? "0";
  const limit = searchParams.get("limit") ?? "0";

  const upstream = `${NEST_API}/api/streamers/popular?offset=${offset}&limit=${limit}`;

  const res = await fetch(upstream, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { items: [], hasMore: false, nextOffset: null },
      { status: res.status },
    );
  }

  const data: unknown = await res.json();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
    },
  });
}
