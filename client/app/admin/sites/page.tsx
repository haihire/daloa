"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

interface Site {
  seq: number;
  name: string;
  href: string;
  category: string | null;
  description: string | null;
  icon: string | null;
  is_active: number;
  click_count: number;
}

const EMPTY_FORM = {
  name: "",
  href: "",
  category: "",
  description: "",
  icon: "",
};

function SiteCardPreview({ form }: { form: typeof EMPTY_FORM }) {
  const iconSrc = (() => {
    if (form.icon) return form.icon;
    if (form.href) {
      try {
        const domain = new URL(form.href).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      } catch {
        return null;
      }
    }
    return null;
  })();

  return (
    <div className="relative flex flex-col rounded-xl border border-[color:var(--admin-border)] bg-[color:var(--admin-surface-muted)] p-3 min-h-[80px]">
      <div className="flex items-start justify-between gap-2 pr-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {iconSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconSrc}
              alt=""
              width={16}
              height={16}
              className="shrink-0 rounded-sm"
            />
          )}
          <span className="truncate font-semibold text-[color:var(--admin-text)] text-sm">
            {form.name || (
              <span className="text-[color:var(--admin-text-subtle)]">
                이름
              </span>
            )}
          </span>
        </div>
        <span className="admin-badge admin-badge-neutral">
          {form.category || "카테고리"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-[color:var(--admin-text-muted)] line-clamp-2">
        {form.description || (
          <span className="text-[color:var(--admin-text-subtle)]">설명</span>
        )}
      </p>
    </div>
  );
}

function getCategoryTone(category: string | null) {
  const value = (category ?? "").toLowerCase();

  if (value.includes("공식") || value.includes("official")) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (value.includes("커뮤니티") || value.includes("community")) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (
    value.includes("도구") ||
    value.includes("tool") ||
    value.includes("계산")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-gray-200 bg-gray-100 text-gray-600";
}

let sitesCache: Site[] | null = null;

export default function AdminSitesPage() {
  const [sites, setSites] = useState<Site[]>(sitesCache ?? []);
  const [loading, setLoading] = useState(sitesCache === null);
  const [error, setError] = useState("");
  const [accessNotice, setAccessNotice] = useState("");
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const role = useAdminRole();
  const isGuest = role === "guest";

  // 백드롭 클릭으로 모달을 닫되, "프레스를 백드롭에서 시작"한 경우에만 닫는다.
  // (입력칸 텍스트를 드래그 선택하다 마우스를 백드롭에서 떼면 click 타깃이
  //  오버레이가 되어 의도치 않게 닫히는 문제 방지)
  const overlayPressOnSelf = useRef(false);

  // 추가/수정 폼
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // 선택된 사이트의 7일 클릭 추이 (우측 그래프)
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [clickSeries, setClickSeries] = useState<
    { bucket: string; count: number }[]
  >([]);
  const [clickYMax, setClickYMax] = useState(0);
  const [seriesLoading, setSeriesLoading] = useState(false);

  const selectSite = useCallback((site: Site) => {
    setSelectedSite(site);
  }, []);

  // 선택된 사이트의 7일 클릭 추이를 가져온다.
  // cleanup으로 이전 요청을 무시해 빠른 연속 클릭 시 경쟁 상태(stale 응답) 방지.
  useEffect(() => {
    if (!selectedSite) return;
    let cancelled = false;
    const seq = selectedSite.seq;
    setSeriesLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/sites/${seq}/click-series?days=7`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          series: { bucket: string; count: number }[];
          yMax?: number;
        };
        if (cancelled) return;
        setClickSeries(data.series ?? []);
        setClickYMax(data.yMax ?? 0);
      } catch {
        if (!cancelled) {
          setClickSeries([]);
          setClickYMax(0);
        }
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSite]);

  function requireMaster(action: string) {
    if (!isGuest) return true;
    setAccessNotice(buildGuestNotice(action));
    return false;
  }

  const load = useCallback(
    async (options?: { withSpinner?: boolean }): Promise<Site[] | null> => {
      const withSpinner = options?.withSpinner ?? false;
      if (withSpinner) {
        setLoading(true);
      }

      try {
        const res = await fetch("/api/admin/sites", { cache: "no-store" });
        if (!res.ok) {
          setError("목록 로드 실패");
          return null;
        }
        const data = (await res.json()) as Site[];
        sitesCache = data;
        setSites(data);
        setError("");
        return data;
      } catch {
        setError("목록 로드 실패");
        return null;
      } finally {
        if (withSpinner) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load({ withSpinner: sitesCache === null });
  }, [load]);

  function startEdit(site: Site) {
    if (!requireMaster("사이트 수정")) return;
    setShowForm(true);
    setEditingId(site.seq);
    setForm({
      name: site.name,
      href: site.href,
      category: site.category ?? "",
      description: site.description ?? "",
      icon: site.icon ?? "",
    });
    setFormError("");
  }

  function cancelEdit() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  async function purgeSitesCache() {
    await fetch("/api/admin/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sites" }),
    });
  }

  function normalizeNullable(value: string | null | undefined) {
    return value ?? null;
  }

  async function parseErrorMessage(res: Response, fallback: string) {
    try {
      const d = (await res.json()) as { message?: string };
      return d.message ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function waitForReflection(
    predicate: (items: Site[]) => boolean,
    retries = 8,
    delayMs = 350,
  ) {
    for (let i = 0; i < retries; i += 1) {
      const items = await load();
      if (items && predicate(items)) {
        return true;
      }
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  async function runWithBusyMessage(
    message: string,
    action: () => Promise<void>,
  ) {
    setBusyMessage(message);
    try {
      await action();
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleSave() {
    if (!requireMaster("사이트 추가/수정")) return;
    if (!form.name || !form.href) {
      setFormError("이름과 URL은 필수입니다");
      return;
    }
    setSaving(true);
    setFormError("");

    const payload = {
      name: form.name,
      href: form.href,
      category: form.category || null,
      description: form.description || null,
      icon: form.icon || null,
    };

    const url = editingId
      ? `/api/admin/sites/${editingId}`
      : "/api/admin/sites";
    const method = editingId ? "PUT" : "POST";

    await runWithBusyMessage(
      editingId ? "수정 반영 확인 중입니다..." : "추가 반영 확인 중입니다...",
      async () => {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          setFormError(await parseErrorMessage(res, "저장 실패"));
          return;
        }

        const data = (await res.json()) as { seq?: number };
        await purgeSitesCache();

        const reflected = await waitForReflection((items) => {
          if (editingId) {
            const target = items.find((item) => item.seq === editingId);
            if (!target) return false;
            return (
              target.name === payload.name &&
              target.href === payload.href &&
              normalizeNullable(target.category) ===
                normalizeNullable(payload.category) &&
              normalizeNullable(target.description) ===
                normalizeNullable(payload.description) &&
              normalizeNullable(target.icon) === normalizeNullable(payload.icon)
            );
          }

          if (data.seq != null) {
            const created = items.find((item) => item.seq === data.seq);
            if (!created) return false;
            return (
              created.name === payload.name &&
              created.href === payload.href &&
              normalizeNullable(created.category) ===
                normalizeNullable(payload.category) &&
              normalizeNullable(created.description) ===
                normalizeNullable(payload.description) &&
              normalizeNullable(created.icon) ===
                normalizeNullable(payload.icon)
            );
          }

          return items.some(
            (item) =>
              item.name === payload.name &&
              item.href === payload.href &&
              normalizeNullable(item.category) ===
                normalizeNullable(payload.category) &&
              normalizeNullable(item.description) ===
                normalizeNullable(payload.description) &&
              normalizeNullable(item.icon) === normalizeNullable(payload.icon),
          );
        });

        if (!reflected) {
          setFormError(
            "DB 반영 확인이 지연되고 있습니다. 잠시 후 다시 확인해주세요.",
          );
          return;
        }

        cancelEdit();
      },
    );
    setSaving(false);
  }

  async function handleToggleActive(site: Site) {
    if (!requireMaster("사이트 활성 상태 변경")) return;
    const nextActive = site.is_active === 0;

    await runWithBusyMessage("활성 상태 반영 확인 중입니다...", async () => {
      const res = await fetch(`/api/admin/sites/${site.seq}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });

      if (!res.ok) {
        setError(await parseErrorMessage(res, "활성 상태 변경 실패"));
        return;
      }

      await purgeSitesCache();
      const reflected = await waitForReflection((items) => {
        const target = items.find((item) => item.seq === site.seq);
        return !!target && target.is_active === (nextActive ? 1 : 0);
      });

      if (!reflected) {
        setError("활성 상태 반영 확인이 지연되고 있습니다.");
      }
    });
  }

  async function handleDelete(seq: number) {
    if (!requireMaster("사이트 삭제")) return;
    if (!confirm("정말 삭제하시겠습니까?")) return;

    await runWithBusyMessage("삭제 반영 확인 중입니다...", async () => {
      const res = await fetch(`/api/admin/sites/${seq}`, { method: "DELETE" });
      if (!res.ok) {
        alert(await parseErrorMessage(res, "삭제 실패"));
        return;
      }

      await purgeSitesCache();
      const reflected = await waitForReflection(
        (items) => !items.some((item) => item.seq === seq),
      );

      if (!reflected) {
        setError("삭제 반영 확인이 지연되고 있습니다.");
      }
    });
  }

  const [purging, setPurging] = useState(false);

  async function handlePurge() {
    if (!requireMaster("사이트 캐시 새로고침")) return;
    setPurging(true);
    await purgeSitesCache();
    setPurging(false);
    alert("사이트 캐시가 무효화됐습니다.");
  }

  const isProcessing = busyMessage !== null;
  // 표시용: 클릭수 내림차순 (동점이면 기존 순서 유지)
  const sortedSites = [...sites].sort(
    (a, b) => (b.click_count ?? 0) - (a.click_count ?? 0),
  );

  return (
    <div className="flex h-full flex-col">
      {/* 헤더 */}
      <div className="flex shrink-0 flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="admin-page-title">사이트 관리</h1>
          {accessNotice && (
            <pre className="mt-3 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {accessNotice}
            </pre>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePurge}
            disabled={purging || isProcessing}
            className="admin-btn admin-btn-secondary"
            title="Redis 사이트 캐시 즉시 삭제"
          >
            {purging ? "처리 중..." : "캐시 새로고침"}
          </button>
          <button
            onClick={() => {
              if (!requireMaster("사이트 추가")) return;
              setShowForm(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
              setFormError("");
            }}
            disabled={isProcessing}
            className="admin-btn admin-btn-primary"
          >
            + 사이트 추가
          </button>
        </div>
      </div>

      {/* 모달 */}
      {showForm && (
        <div
          className="admin-modal-overlay"
          onMouseDown={(e) => {
            overlayPressOnSelf.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            // mousedown·click 모두 오버레이 자신에서 일어난 진짜 백드롭 클릭만 닫기
            if (
              !isProcessing &&
              e.target === e.currentTarget &&
              overlayPressOnSelf.current
            ) {
              cancelEdit();
            }
            overlayPressOnSelf.current = false;
          }}
        >
          <div className="admin-modal w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[color:var(--admin-text)]">
                {editingId ? `사이트 수정 · #${editingId}` : "새 사이트 추가"}
              </h2>
              <button
                onClick={cancelEdit}
                disabled={isProcessing}
                className="text-[color:var(--admin-text-subtle)] hover:text-[color:var(--admin-text)] text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-6">
              {/* 폼 */}
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-2 gap-4">
                  {(
                    ["name", "href", "category", "description"] as const
                  ).map((field) => (
                    <div
                      key={field}
                      className={field === "description" ? "col-span-2" : ""}
                    >
                      <label className="admin-label capitalize">{field}</label>
                      <input
                        type="text"
                        value={form[field]}
                        disabled={isProcessing}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="admin-input"
                      />
                    </div>
                  ))}
                </div>
                {formError && (
                  <p className="text-red-500 text-xs mt-2">{formError}</p>
                )}
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={handleSave}
                    disabled={saving || isProcessing}
                    className="admin-btn admin-btn-primary"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isProcessing}
                    className="admin-btn admin-btn-secondary"
                  >
                    취소
                  </button>
                </div>
              </div>

              {/* 카드 미리보기 */}
              <div className="w-52 shrink-0">
                <p className="text-xs text-[color:var(--admin-text-muted)] mb-2 font-medium">
                  미리보기
                </p>
                <SiteCardPreview form={form} />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="admin-card mb-4 shrink-0 px-4 py-3 border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {loading ? (
        <div className="admin-loading-box">
          <p className="text-sm text-[color:var(--admin-text-muted)]">
            사이트 목록을 불러오는 중입니다...
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="admin-card overflow-hidden flex-1 min-w-0 flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="admin-table table-fixed w-full min-w-[860px]">
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "21%" }} />
                <col style={{ width: "23%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "7%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-center">이름</th>
                  <th className="text-center">URL</th>
                  <th className="text-center">설명</th>
                  <th className="text-center">카테고리</th>
                  <th className="text-center">활성</th>
                  <th className="text-center">액션</th>
                  <th className="text-center">인기도</th>
                </tr>
              </thead>
              <tbody>
                {sortedSites.map((site) => (
                  <tr
                    key={site.seq}
                    onClick={() => selectSite(site)}
                    className={`cursor-pointer ${
                      selectedSite?.seq === site.seq
                        ? "bg-blue-50/70"
                        : ""
                    }`}
                  >
                    <td className="text-center font-medium truncate">{site.name}</td>
                    <td className="text-center">
                      <a
                        href={site.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate text-center text-blue-600 hover:text-blue-700 hover:underline"
                        title={site.href}
                      >
                        {site.href}
                      </a>
                    </td>
                    <td
                      className="text-center text-[color:var(--admin-text-muted)] truncate"
                      title={site.description ?? ""}
                    >
                      {site.description ?? "-"}
                    </td>
                    <td className="text-center">
                      {site.category ? (
                        <span
                          className={`admin-badge ${getCategoryTone(site.category)}`}
                        >
                          {site.category}
                        </span>
                      ) : (
                        <span className="text-[color:var(--admin-text-subtle)]">
                          -
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(site);
                        }}
                        disabled={isProcessing}
                        className={`admin-badge ${
                          site.is_active
                            ? "admin-badge-success cursor-pointer"
                            : "admin-badge-neutral cursor-pointer"
                        }`}
                      >
                        {site.is_active ? "활성" : "비활성"}
                      </button>
                    </td>
                    <td className="text-center" style={{ paddingLeft: 6, paddingRight: 6 }}>
                      <div className="flex justify-center gap-1 flex-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(site);
                          }}
                          disabled={isProcessing}
                          className="admin-btn admin-btn-sm admin-btn-secondary whitespace-nowrap"
                        >
                          수정
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(site.seq);
                          }}
                          disabled={isProcessing}
                          className="admin-btn admin-btn-sm admin-btn-danger whitespace-nowrap"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                    <td className="text-center tabular-nums font-semibold text-blue-600">
                      {site.click_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 선택 사이트 7일 클릭 추이 */}
        <div className="admin-card w-80 shrink-0 self-start p-4 hidden lg:block">
          {!selectedSite ? (
            <p className="text-sm text-[color:var(--admin-text-muted)] text-center py-10">
              사이트를 클릭하면
              <br />
              최근 7일 클릭 추이를 볼 수 있어요.
            </p>
          ) : (
            <div>
              {/* 이름(왼쪽) + 총 클릭수(오른쪽 끝) */}
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <p className="text-sm font-semibold truncate">
                  {selectedSite.name}
                </p>
                <span className="shrink-0">
                  <span className="text-lg font-bold text-blue-600 tabular-nums">
                    {selectedSite.click_count.toLocaleString()}
                  </span>
                  <span className="text-xs text-[color:var(--admin-text-muted)] ml-1">
                    클릭
                  </span>
                </span>
              </div>
              {seriesLoading ? (
                <p className="text-xs text-[color:var(--admin-text-muted)] py-10 text-center">
                  불러오는 중...
                </p>
              ) : (
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={clickSeries}>
                      <defs>
                        <linearGradient id="siteClickFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="bucket"
                        interval={0}
                        tick={{ fontSize: 9, fill: "#6b7280" }}
                      />
                      <YAxis
                        allowDecimals={false}
                        width={28}
                        domain={[0, Math.max(clickYMax, 1)]}
                        tick={{ fontSize: 10, fill: "#6b7280" }}
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#siteClickFill)"
                        dot={{ r: 3, fill: "#3b82f6" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {isProcessing && (
        <div className="admin-modal-overlay">
          <div className="admin-modal px-6 py-5 text-center">
            <p className="text-sm font-semibold text-[color:var(--admin-text)]">
              처리중입니다...
            </p>
            <p className="mt-1 text-xs text-[color:var(--admin-text-muted)]">
              {busyMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
