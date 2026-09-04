import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

async function getToken(): Promise<string> {
  const store = await cookies();
  return store.get("admin_token")?.value ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken();
    const body = await req.json();
    const res = await fetch(`${NEST_API}/api/admin/cache/purge`, {
      method: "POST",
      headers: {
        "x-admin-session": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "admin cache purge upstream unavailable" },
      { status: 503 },
    );
  }
}

export async function DELETE() {
  try {
    const token = await getToken();
    const res = await fetch(`${NEST_API}/api/admin/cache/purge-all`, {
      method: "POST",
      headers: { "x-admin-session": token },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "admin cache purge-all upstream unavailable" },
      { status: 503 },
    );
  }
}
