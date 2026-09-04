import { Fragment } from "react";
import Link from "next/link";

/**
 * 홈과 문서 페이지가 공유하는 푸터.
 *
 * 링크를 저작권 표기와 같은 줄에 두고 11px로 줄여, 링크가 없던 최소 버전과 높이가 같다.
 * 광고 네트워크는 대개 사이트 안에서 도달 가능한 개인정보처리방침을 요구하므로 이 링크는
 * 심사 기간 내내 살아 있어야 한다. 크롤러가 세 페이지를 발견하는 유일한 경로이기도 하다.
 */
const FOOTER_LINKS = [
  { href: "/about", label: "소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/contact", label: "문의" },
] as const;

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-2 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 dark:text-slate-500">
        {FOOTER_LINKS.map((link, i) => (
          <Fragment key={link.href}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <Link
              href={link.href}
              className="transition-colors hover:text-slate-700 dark:hover:text-slate-300"
            >
              {link.label}
            </Link>
          </Fragment>
        ))}
        <span aria-hidden="true">·</span>
        <span>© 2026 로모아</span>
      </div>
    </footer>
  );
}
