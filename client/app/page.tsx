import SiteList from "@/components/sites/SiteList";
import SiteFooter from "@/components/layout/SiteFooter";
import sitesData from "@/data/sites.json";
import type { Site } from "@/types";
import type { Metadata } from "next";

// 홈 전용 canonical (루트 레이아웃에 두면 하위 페이지가 상속받아 색인 병합 문제 → 페이지별 지정)
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// 사이트 목록은 빌드 시점에 JSON에서 읽는다. 예전엔 EC2의 Nest API를 ISR(revalidate 600)로
// 불러왔는데, 그 구조는 트래픽이 적을 때 캐시가 축출되면 첫 방문자가 콜드 생성(TTFB 7~10s)을
// 뒤집어썼고 API가 느리면 함수 타임아웃으로 5xx까지 났다. EC2를 정리하면서 데이터를 리포에
// 넣어 그 실패 모드를 통째로 없앴다 — 목록이 바뀌면 sites.json을 고쳐 다시 배포한다.
const sites = sitesData as Site[];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 py-3">
        <div className="grid grid-cols-1 gap-4 px-1 sm:px-2 md:px-3 xl:grid-cols-[1fr_minmax(0,1100px)_1fr] xl:px-0">
          <div className="hidden xl:block" aria-hidden="true" />

          <main className="flex flex-col gap-2">
            <header className="fade-in flex flex-col items-center gap-2 sm:min-h-9 sm:justify-center">
              <h1 className="text-center text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
                로모아
              </h1>
            </header>

            <section className="flex flex-col gap-4">
              <SiteList sites={sites} />
            </section>
          </main>

          <div className="hidden xl:block" aria-hidden="true" />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
