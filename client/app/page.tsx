import { Suspense } from "react";
import StatBuildList from "@/components/characters/StatBuildList";
import SiteList from "@/components/sites/SiteList";
import YoutubeSection from "@/components/youtube/YoutubeSection";
import type { Site, StatBuildTab } from "@/types";

const API = process.env.NEST_API_URL ?? "http://localhost:3001";

async function recordServerTiming(input: {
  name: string;
  path: string;
  durationMs: number;
}) {
  await fetch(`${API}/api/telemetry/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "request",
      scope: "section",
      ...input,
    }),
    cache: "no-store",
  }).catch(() => {});
}

async function timedFetch<T>(label: string, url: string, revalidate: number) {
  const started = Date.now();
  const data = await fetch(url, { next: { revalidate } })
    .then<T>((r) => r.json())
    .catch(() => [] as T);
  const durationMs = Date.now() - started;
  void recordServerTiming({
    name: label,
    path: url,
    durationMs,
  });
  return { data, durationMs };
}

export default async function Home() {
  const [sitesRes, statRes] = await Promise.all([
    timedFetch<Site[]>("sites", `${API}/api/sites`, 3600),
    timedFetch<StatBuildTab[]>("stat-builds", `${API}/api/characters/stat-builds`, 300),
  ]);

  const sites = sitesRes.data;
  const statBuilds = statRes.data;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 py-3">
        <div className="grid grid-cols-1 gap-4 pl-4 pr-7 sm:px-4 xl:grid-cols-[160px_minmax(0,1fr)_160px]">
          <div className="hidden xl:block" aria-hidden="true" />

          <main className="flex flex-col gap-2">
            <header className="fade-in text-center">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                관리자 - 로아 사이트 모음
              </h1>
            </header>

            <section className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[320px_minmax(0,1fr)]">
                <div className="hidden h-full flex-col gap-4 sm:flex">
                  <StatBuildList tabs={statBuilds} />
                </div>
                <div>
                  <SiteList sites={sites} />
                </div>
              </div>
            </section>

            <Suspense
              fallback={
                <div className="animate-pulse space-y-2 pt-2">
                  <div className="h-5 w-36 rounded bg-slate-200" />
                  <div className="flex gap-3 overflow-hidden">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-[190px] w-[270px] shrink-0 rounded-lg bg-slate-200"
                      />
                    ))}
                  </div>
                </div>
              }
            >
              <YoutubeSection />
            </Suspense>

            <div className="sm:hidden">
              <StatBuildList tabs={statBuilds} />
            </div>
          </main>

          <div className="hidden xl:block" aria-hidden="true" />
        </div>
      </div>

      <footer className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 text-center text-xs text-slate-500 sm:text-sm">
          <p>© 2026 로아</p>
        </div>
      </footer>
    </div>
  );
}
