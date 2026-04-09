"use client";

import type { Site } from "@/types";

interface Props {
  sites: Site[];
}

export default function SiteList({ sites }: Props) {
  return (
    <section className="flex max-h-[calc(100vh-160px)] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur">
      <h2 className="shrink-0 border-b border-slate-100 px-4 py-3 text-lg font-semibold text-slate-900">
        사이트 모음
      </h2>
      <div className="stagger flex-1 overflow-y-auto p-4">
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {sites.map((site) => (
            <li key={site.name}>
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  window.open(site.href, "_blank", "noopener,noreferrer")
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  window.open(site.href, "_blank", "noopener,noreferrer")
                }
                className="flex h-full cursor-pointer select-none flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 transition-transform duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {site.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={site.icon}
                        alt=""
                        width={16}
                        height={16}
                        className="shrink-0 rounded-sm"
                      />
                    )}
                    <span className="truncate font-semibold text-slate-900">
                      {site.name}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                    {site.category}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  {site.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
