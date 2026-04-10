import StatBuildList from "@/components/characters/StatBuildList";
import SiteList from "@/components/sites/SiteList";
import type { Site, StatBuildTab } from "@/types";

// SSR: NestJS 서버에서 데이터를 직접 fetch (빌드 시 또는 요청마다)
const API = process.env.NEST_API_URL ?? "http://localhost:3001";

export default async function Home() {
  const [sites, statBuilds] = await Promise.all([
    fetch(`${API}/api/sites`, { next: { revalidate: 300 } }).then<Site[]>((r) =>
      r.json(),
    ),
    fetch(`${API}/api/characters/stat-builds`, {
      next: { revalidate: 300 },
    }).then<StatBuildTab[]>((r) => r.json()),
  ]);

  return (
    <div className="relative min-h-screen overflow-hidden py-8">
      <div className="pointer-events-none absolute -left-20 top-6 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-6 h-72 w-72 rounded-full bg-orange-400/20 blur-3xl" />

      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
        <header className="mx-4 rounded-2xl border border-white/50 bg-white/70 p-6 shadow-lg backdrop-blur-xl fade-in sm:mx-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
            LOST ARK DASHBOARD
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            다로아 - 로아 사이트 모음
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            가운데는 사이트 모음, 왼쪽은 특성 빌드 분포, 오른쪽은 방송 라이브
            모음으로 구성한 시작 템플릿입니다.
          </p>
        </header>

        <section className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-[320px_minmax(0,1fr)]">
            <StatBuildList tabs={statBuilds} />
            <SiteList sites={sites} />
          </div>
        </section>
      </main>
    </div>
  );
}
