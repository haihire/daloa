import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /admin/login 은 통과
  if (pathname === "/admin/login") return NextResponse.next();

  // /admin/* 는 쿠키 체크
  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("admin_token")?.value;
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }

    try {
      const res = await fetch(`${NEST_API}/api/admin/monitoring/dashboard`, {
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
    } catch {
      // Keep existing behavior if upstream is temporarily unavailable.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
