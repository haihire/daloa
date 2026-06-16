import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

async function getToken(): Promise<string> {
  const store = await cookies();
  return store.get("admin_token")?.value ?? "";
}

export async function GET() {
  try {
    const token = await getToken();
    const res = await fetch(`${NEST_API}/api/admin/youtube/blocked`, {
      headers: { "x-admin-session": token },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ items: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "admin youtube blocked upstream unavailable" },
      { status: 503 },
    );
  }
}
