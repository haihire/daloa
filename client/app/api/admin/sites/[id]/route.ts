import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

async function getToken(): Promise<string> {
  const store = await cookies();
  return store.get("admin_token")?.value ?? "";
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getToken();
  const body = await req.json();
  const res = await fetch(`${NEST_API}/api/admin/sites/${id}`, {
    method: "PUT",
    headers: {
      "x-admin-session": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getToken();
  const res = await fetch(`${NEST_API}/api/admin/sites/${id}`, {
    method: "DELETE",
    headers: { "x-admin-session": token },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
