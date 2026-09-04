/**
 * 홈과 문서 페이지가 공유하는 푸터.
 *
 * 소개·개인정보처리방침·문의 링크를 빼서 높이를 줄였다. 세 페이지는 그대로 살아 있고
 * sitemap.xml에도 등록돼 있지만, 사이트 안에서 그리로 가는 링크는 이제 없다.
 * → 광고 네트워크에 심사를 넣기 전에는 최소한 개인정보처리방침 링크를 되살려야 한다
 *   (대부분의 네트워크가 사이트에서 도달 가능한 방침 페이지를 요구한다).
 */
export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-2 text-center text-[11px] text-slate-400 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-500">
      © 2026 로모아
    </footer>
  );
}
