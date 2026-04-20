import StatBuildList from "@/components/characters/StatBuildList";
import SiteList from "@/components/sites/SiteList";
import YoutubeList from "@/components/youtube/YoutubeList";
import ClassSummaryList from "@/components/class-summary/ClassSummaryList";
import type { ClassSummary, Site, StatBuildTab } from "@/types";

// SSR: NestJS 서버에서 데이터를 직접 fetch (빌드 시 또는 요청마다)
const API = process.env.NEST_API_URL ?? "http://localhost:3001";

export default async function Home() {
  const [sites, statBuilds, classSummaries] = await Promise.all([
    fetch(`${API}/api/sites`, { cache: "no-store" })
      .then<Site[]>((r) => r.json())
      .catch(() => [] as Site[]),
    fetch(`${API}/api/characters/stat-builds`, {
      next: { revalidate: 300 },
    })
      .then<StatBuildTab[]>((r) => r.json())
      .catch(() => [] as StatBuildTab[]),
    fetch(`${API}/api/class-summary`, { next: { revalidate: 3600 } })
      .then<ClassSummary[]>((r) => r.json())
      .catch(() => [] as ClassSummary[]),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 py-3">
        {/* 좌우 광고 슬롯 예약 (미표시) + 중앙 콘텐츠 */}
        <div className="grid grid-cols-1 gap-4 px-4 xl:grid-cols-[160px_minmax(0,1fr)_160px]">
          {/* 왼쪽 광고 슬롯 (예약만, 표시 안 함) */}
          <div className="hidden xl:block" aria-hidden="true" />

          <main className="flex flex-col gap-2">
            <header className="fade-in text-center">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                다로아 - 로아 사이트 모음
              </h1>
            </header>

            <section className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[320px_minmax(0,1fr)]">
                <div className="flex h-full flex-col gap-4">
                  <StatBuildList tabs={statBuilds} />
                  <ClassSummaryList summaries={classSummaries} />
                </div>
                <SiteList sites={sites} />
              </div>
            </section>

            {/* 하단 유튜브 인기 영상 */}
            <YoutubeList />
          </main>

          {/* 오른쪽 광고 슬롯 (예약만, 표시 안 함) */}
          <div className="hidden xl:block" aria-hidden="true" />
        </div>
      </div>

      <footer className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 text-center text-xs text-slate-500 sm:text-sm">
          <p className="text-[11px] text-slate-400 sm:text-xs">
            Lost Ark and related assets belong to Smilegate RPG.
          </p>
        </div>
      </footer>
    </div>
  );
}
