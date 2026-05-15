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
  const totalSites = sites.length;
  const activeSites = sites.filter((site) => site.is_active === 1).length;
  const inactiveSites = totalSites - activeSites;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="admin-page-title">사이트 관리</h1>
          <p className="admin-page-subtitle mt-1">
            등록된 사이트 상태를 관리하고 즉시 반영 여부를 확인합니다.
          </p>
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

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="admin-stat-card">
          <p className="admin-stat-label">전체 사이트</p>
          <p className="admin-stat-value mt-1">{totalSites}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">활성</p>
          <p className="admin-stat-value mt-1 text-emerald-600">
            {activeSites}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">비활성</p>
          <p className="admin-stat-value mt-1 text-gray-400">{inactiveSites}</p>
        </div>
      </div>

      {/* 모달 */}
      {showForm && (
        <div
          className="admin-modal-overlay"
          onClick={(e) => {
            if (!isProcessing && e.target === e.currentTarget) cancelEdit();
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
                    ["name", "href", "category", "description", "icon"] as const
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
        <div className="admin-card mb-4 px-4 py-3 border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {loading ? (
        <div className="admin-card admin-card-padded text-center">
          <p className="text-sm text-[color:var(--admin-text-muted)]">
            불러오는 중...
          </p>
        </div>
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th>이름</th>
                  <th>URL</th>
                  <th>설명</th>
                  <th>카테고리</th>
                  <th className="text-center">활성</th>
                  <th className="text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.seq}>
                    <td className="text-center text-[color:var(--admin-text-subtle)] tabular-nums">
                      {site.seq}
                    </td>
                    <td className="font-medium">{site.name}</td>
                    <td>
                      <a
                        href={site.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-xs truncate text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {site.href}
                      </a>
                    </td>
                    <td className="text-[color:var(--admin-text-muted)] max-w-xs truncate">
                      {site.description ?? "-"}
                    </td>
                    <td>
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
                        onClick={() => handleToggleActive(site)}
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
                    <td>
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => startEdit(site)}
                          disabled={isProcessing}
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(site.seq)}
                          disabled={isProcessing}
                          className="admin-btn admin-btn-sm admin-btn-danger"
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
