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
      {/* 공정위 추천·보증 심사지침에 따른 대가성 공개. 쿠팡 파트너스 필수 고지사항이며
          광고(홈 하단 배너) 바로 아래에 놓이도록 푸터에 둔다. 광고를 내리기 전까지 지우지 말 것. */}
      <p className="mt-1 text-center text-[10px] leading-snug text-slate-400 dark:text-slate-600">
        이 사이트는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를
        제공받습니다.
      </p>
    </footer>
  );
}
