import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("admin_token")?.value;
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }

    try {
      const res = await fetch(`${NEST_API}/api/admin/auth/me`, {
        headers: { "x-admin-session": token },
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/admin/login";
        const redirect = NextResponse.redirect(loginUrl);
        redirect.cookies.set("admin_token", "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
        return redirect;
      }
      if (!res.ok) {
        return NextResponse.json(
          { message: "admin auth check failed" },
          { status: 503 },
        );
      }
    } catch {
      return NextResponse.json(
        { message: "admin auth upstream unavailable" },
        { status: 503 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
