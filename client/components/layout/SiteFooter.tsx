import Link from "next/link";

/** 홈과 문서 페이지가 공유하는 푸터. 정책 페이지로 가는 유일한 내부 링크라
 *  크롤러가 여기를 통해 /about·/privacy·/contact 를 발견한다. */
const FOOTER_LINKS = [
  { href: "/about", label: "소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/contact", label: "문의" },
] as const;

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-slate-900 hover:underline dark:hover:text-slate-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p>© 2026 로모아</p>
      </div>
    </footer>
  );
}
