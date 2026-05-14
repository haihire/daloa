"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin/sites", label: "사이트 관리" },
  { href: "/admin/characters", label: "캐릭터 목록" },
  { href: "/admin/cache", label: "캐시 무효화" },
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

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <span className="text-sm font-semibold text-indigo-400">
            다로아 관리자
          </span>
        </div>
        <nav className="flex-1 py-4">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-4 py-2 text-sm hover:bg-gray-800 transition-colors ${
                pathname.startsWith(href)
                  ? "bg-gray-800 text-white font-medium"
                  : "text-gray-400"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-800">
          <button
            onClick={logout}
            className="w-full text-left text-xs text-gray-500 hover:text-gray-300 transition-colors"
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
