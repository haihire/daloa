"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin/sites", label: "사이트 관리" },
  { href: "/admin/characters", label: "캐릭터 목록" },
  { href: "/admin/youtube", label: "유튜브" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className="admin-sidebar w-56 flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-[color:var(--admin-sidebar-border)]">
          <span className="admin-sidebar-brand text-base font-bold">
            다로아 <span className="text-blue-400">Admin</span>
          </span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`admin-sidebar-link block px-3 py-2 rounded-lg text-sm ${active ? "is-active" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-[color:var(--admin-sidebar-border)]">
          <button
            onClick={logout}
            className="admin-sidebar-logout w-full text-left text-xs"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
