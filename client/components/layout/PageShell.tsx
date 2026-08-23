import Link from "next/link";
import SiteFooter from "./SiteFooter";

interface Props {
  title: string;
  /** 정책 문서만 표시. 소개/문의처럼 개정 이력이 의미 없는 페이지는 생략한다. */
  updatedAt?: string;
  children: React.ReactNode;
}

/**
 * 소개·개인정보처리방침·문의처럼 "글이 흐르는" 페이지의 공통 껍데기.
 *
 * 루트 <html>이 overflow-hidden이다(홈은 SiteList가 자체 스크롤을 갖는 고정 뷰포트
 * 레이아웃이라 문서 스크롤이 없다). 그대로 두면 긴 글이 뷰포트 밖에서 잘려 아예
 * 읽을 수 없으므로, 여기서 페이지 자체 스크롤 컨테이너를 만든다.
 */
export default function PageShell({ title, updatedAt, children }: Props) {
  return (
    <div className="h-screen overflow-y-auto">
      <div className="flex min-h-full flex-col">
        <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-6">
          {/* 다크모드 토글이 right-4 top-4에 fixed로 떠 있어 우상단은 비워둔다 */}
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <span aria-hidden="true">←</span> 로모아 홈
          </Link>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {title}
          </h1>
          {updatedAt && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              최종 수정일: {updatedAt} (KST)
            </p>
          )}

          <div className="doc-prose mt-8">{children}</div>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}
