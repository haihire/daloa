"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin/monitoring", label: "모니터링" },
  { href: "/admin/containers", label: "컨테이너 현황" },
  { href: "/admin/sites", label: "사이트 관리" },
  { href: "/admin/inven", label: "사이트 추천" },
  { href: "/admin/feedback", label: "사용자 피드백" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // 어드민은 항상 라이트 테마. 메인 사이트의 다크모드(html.dark)가 어드민의
  // dark: variant 클래스에 적용되지 않도록, 어드민 진입 동안 dark를 제거하고 이탈 시 복원한다.
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    html.classList.remove("dark");
    return () => {
      if (wasDark) html.classList.add("dark");
    };
  }, []);

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell h-screen flex overflow-hidden">
      <aside className="admin-sidebar w-56 flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-[color:var(--admin-sidebar-border)] flex items-center justify-between">
          <span className="admin-sidebar-brand text-base font-bold">
            관리자
          </span>
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title="메인 사이트로 이동"
            className="rounded-lg bg-white p-1.5 leading-none transition-opacity hover:opacity-70"
          >
            <Image src="/icon.png" alt="lomoa" width={32} height={32} />
          </Link>
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
            className="admin-sidebar-logout w-full text-left"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
