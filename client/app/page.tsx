import SiteList from "@/components/sites/SiteList";
import SiteFooter from "@/components/layout/SiteFooter";
import { SideAd, BottomAd } from "@/components/ads/AdSlots";
import DarkModeToggle from "@/components/DarkModeToggle";
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
    <div className="flex h-screen flex-col">
      <div className="min-h-0 flex-1 py-3">
        <div className="grid h-full grid-cols-1 gap-4 px-1 sm:px-2 min-[640px]:grid-cols-[minmax(136px,1fr)_minmax(0,1100px)_minmax(136px,1fr)] min-[640px]:px-0">
          <SideAd />

          <main className="flex h-full min-h-0 w-full flex-col gap-2">
            {/* 제목은 가운데 고정, 토글은 헤더 오른쪽 끝. 예전엔 토글이 화면에
                fixed로 떠 있었는데 광고가 들어오면서 겹칠 여지가 생겨 헤더 안으로 넣었다. */}
            <header className="fade-in relative flex min-h-9 items-center justify-center">
              <h1 className="text-center text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
                로모아
              </h1>
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <DarkModeToggle />
              </div>
            </header>

            <section className="flex min-h-0 flex-1 flex-col gap-4">
              <SiteList sites={sites} />
            </section>

            <BottomAd />
          </main>

          <SideAd />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
