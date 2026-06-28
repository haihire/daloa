import { Suspense } from "react";
import { after } from "next/server";
import SiteList from "@/components/sites/SiteList";
import StreamSection from "@/components/stream/StreamSection";
import type { Site } from "@/types";
import type { Metadata } from "next";

// 홈 전용 canonical (루트 레이아웃에 두면 하위 페이지가 상속받아 색인 병합 문제 → 페이지별 지정)
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// 홈을 정적 ISR로 서빙 → 서울 엣지 CDN에서 캐시된 HTML 제공(TTFB 대폭 단축).
// 10분마다 백그라운드 재검증. 이 시점에만 아래 섹션 fetch/텔레메트리가 실행됨.
// 트래픽이 적으면 캐시가 만료·축출돼 첫 방문자가 콜드 생성(TTFB 7~10s)을 뒤집어쓴다.
// → 외부 업타임 핑거가 홈을 주기적으로 호출해 캐시를 데움(.github/SETUP_GUIDE.md "홈 캐시 워밍").
//   재검증 주기를 늘려(300→600) 재생성 빈도·콜드 노출 확률을 함께 낮춘다.
//   (홈 데이터(사이트/스탯/요약)는 자주 안 바뀌어 10분 신선도면 충분)
export const revalidate = 600;

const API = process.env.NEST_API_URL ?? "http://localhost:3001";

async function recordServerTiming(input: {
  name: string;
  path: string;
  durationMs: number;
}) {
  const telemetryToken = process.env.TELEMETRY_INGEST_TOKEN;
  await fetch(`${API}/api/telemetry/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(telemetryToken ? { "x-telemetry-token": telemetryToken } : {}),
    },
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
  // 텔레메트리는 호출처에서 after()로 모아 보냄(렌더 경로 밖). 여기서 직접 보내면
  // no-store fetch가 렌더 중 실행돼 라우트가 dynamic으로 떨어지고 정적 ISR이 깨진다.
  return { data, durationMs, name: label, path: url };
}

export default async function Home() {
  const [sitesRes] = await Promise.all([
    timedFetch<Site[]>("sites", `${API}/api/sites`, 3600),
  ]);

  after(async () => {
    await Promise.all(
      [sitesRes].map((res) =>
        recordServerTiming({
          name: res.name,
          path: res.path,
          durationMs: res.durationMs,
        }),
      ),
    );
  });

  // prerender 안전장치: API가 배열이 아닌 값을 줘도 깨지지 않도록 방어
  const sites = Array.isArray(sitesRes.data) ? sitesRes.data : [];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 py-3">
        <div className="grid grid-cols-1 gap-4 px-1 sm:px-2 md:px-3 xl:grid-cols-[1fr_minmax(0,1100px)_1fr] xl:px-0">
          <div className="hidden xl:block" aria-hidden="true" />

          <main className="flex flex-col gap-2">
            <header className="fade-in text-center">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
                로모아 - 로아 사이트 모음
              </h1>
            </header>

            <section className="flex flex-col gap-4">
              <SiteList sites={sites} />
            </section>

            <Suspense
              fallback={
                <div className="animate-pulse space-y-2 pt-2 mt-4">
                  <div className="h-5 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="flex gap-2 overflow-hidden">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="shrink-0 w-[180px] aspect-video rounded-lg bg-slate-200 dark:bg-slate-700"
                      />
                    ))}
                  </div>
                </div>
              }
            >
              <div className="mt-4">
                <StreamSection />
              </div>
            </Suspense>


          </main>

          <div className="hidden xl:block" aria-hidden="true" />
        </div>
      </div>

      <footer className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 text-center text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
          <p>© 2026 로아</p>
        </div>
      </footer>
    </div>
  );
}
