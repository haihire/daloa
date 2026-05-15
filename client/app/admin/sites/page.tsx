"use client";

import { useCallback, useEffect, useState } from "react";

interface Site {
  seq: number;
  name: string;
  href: string;
  category: string | null;
  description: string | null;
  icon: string | null;
  is_active: number;
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
    <div className="relative flex flex-col rounded-xl border border-gray-200 bg-gray-50 p-3 min-h-[80px]">
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
          <span className="truncate font-semibold text-gray-900 text-sm">
            {form.name || <span className="text-gray-400">이름</span>}
          </span>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs text-gray-600 bg-gray-100 border border-gray-200">
          {form.category || "카테고리"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-gray-600 line-clamp-2">
        {form.description || <span className="text-gray-400">설명</span>}
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
  if (value.includes("도구") || value.includes("tool") || value.includes("계산")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-gray-200 bg-gray-100 text-gray-600";
}

export default function AdminSitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  // 추가/수정 폼
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

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
    void load({ withSpinner: true });
  }, [load]);

  function startEdit(site: Site) {
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
              normalizeNullable(created.icon) === normalizeNullable(payload.icon)
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
    setPurging(true);
    await purgeSitesCache();
    setPurging(false);
    alert("사이트 캐시가 무효화됐습니다.");
  }

  const isProcessing = busyMessage !== null;
  const rowActionBaseClass =
    "inline-flex items-center justify-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const totalSites = sites.length;
  const activeSites = sites.filter((site) => site.is_active === 1).length;
  const inactiveSites = totalSites - activeSites;

  return (
    <div className="space-y-5 p-4 admin-content-shell rounded-xl">
      <div className="px-5 py-4 admin-content-panel rounded-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">사이트 관리</h1>
            <p className="mt-1 text-xs text-gray-500">
              등록된 사이트 상태를 한 곳에서 관리하고 즉시 반영 여부를 확인합니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500">전체</p>
              <p className="text-sm font-semibold text-gray-900">{totalSites}</p>
            </div>
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-emerald-600">활성</p>
              <p className="text-sm font-semibold text-emerald-700">{activeSites}</p>
            </div>
            <div className="border border-rose-200 bg-rose-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-rose-500">비활성</p>
              <p className="text-sm font-semibold text-rose-600">{inactiveSites}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handlePurge}
            disabled={purging || isProcessing}
            className="text-sm border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 px-3 py-2 rounded-lg transition-colors"
            title="Redis 사이트 캐시 즉시 삭제"
          >
            {purging ? "처리 중..." : "새로고침"}
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
              setFormError("");
            }}
            disabled={isProcessing}
            className="text-sm border border-blue-600 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            + 사이트 추가
          </button>
        </div>
      </div>

      {/* 모달 */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (!isProcessing && e.target === e.currentTarget) cancelEdit();
          }}
        >
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">
                {editingId ? `사이트 수정 — #${editingId}` : "새 사이트 추가"}
              </h2>
              <button
                onClick={cancelEdit}
                disabled={isProcessing}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-6">
              {/* 폼 */}
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-2 gap-4">
                  {(
                    ["name", "href", "category", "description", "icon"] as const
                  ).map((field) => (
                    <div
                      key={field}
                      className={field === "description" ? "col-span-2" : ""}
                    >
                      <label className="block text-xs text-gray-600 mb-1 capitalize">
                        {field}
                      </label>
                      <input
                        type="text"
                        value={form[field]}
                        disabled={isProcessing}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isProcessing}
                    className="text-gray-500 hover:text-gray-700 border border-gray-300 bg-white text-sm px-4 py-1.5 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>

              {/* 카드 미리보기 */}
              <div className="w-52 shrink-0">
                <p className="text-xs text-gray-400 mb-2">미리보기</p>
                <SiteCardPreview form={form} />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {loading ? (
        <div className="px-4 py-8 text-center admin-content-panel rounded-lg">
          <p className="text-sm text-gray-400">불러오는 중...</p>
        </div>
      ) : (
        <div className="overflow-x-auto admin-content-table rounded-xl shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600 text-center">
                <th className="py-3 pr-4 w-10 font-medium">#</th>
                <th className="py-3 pr-4 font-medium">이름</th>
                <th className="py-3 pr-4 font-medium">URL</th>
                <th className="py-3 pr-4 font-medium">설명</th>
                <th className="py-3 pr-4 font-medium">카테고리</th>
                <th className="py-3 pr-4 font-medium">활성</th>
                <th className="py-3 font-medium">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.map((site) => (
                <tr
                  key={site.seq}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 pr-4 text-center text-gray-400">{site.seq}</td>
                  <td className="py-3 pr-4 text-center text-gray-900 font-medium">{site.name}</td>
                  <td className="py-3 pr-4">
                    <a
                      href={site.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mx-auto block max-w-xs truncate text-center text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {site.href}
                    </a>
                  </td>
                  <td className="py-3 pr-4 text-center text-gray-600">
                    {site.description ?? "-"}
                  </td>
                  <td className="py-3 pr-4 text-center text-gray-600">
                    {site.category ? (
                      <span className="inline-flex items-center justify-center border border-gray-200 bg-gray-100 rounded-full px-2 py-0.5 text-xs text-gray-700">
                        {site.category}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <button
                      onClick={() => handleToggleActive(site)}
                      disabled={isProcessing}
                      className={`${rowActionBaseClass} min-w-[64px] ${
                        site.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {site.is_active ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => startEdit(site)}
                        disabled={isProcessing}
                        className={`${rowActionBaseClass} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(site.seq)}
                        disabled={isProcessing}
                        className={`${rowActionBaseClass} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-5 text-center shadow-2xl">
            <p className="text-sm font-semibold text-gray-900">처리중입니다...</p>
            <p className="mt-1 text-xs text-gray-500">{busyMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
