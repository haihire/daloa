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
    <div className="min-h-screen py-8">
      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
        <header className="fade-in text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            다로아 - 로아 사이트 모음
          </h1>
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
