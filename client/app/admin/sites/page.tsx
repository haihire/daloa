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
    <div className="relative flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 min-h-[80px]">
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
          <span className="truncate font-semibold text-slate-900 text-sm">
            {form.name || <span className="text-slate-400">이름</span>}
          </span>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs text-white bg-slate-900">
          {form.category || "카테고리"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
        {form.description || <span className="text-slate-400">설명</span>}
      </p>
    </div>
  );
}

export default function AdminSitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 추가/수정 폼
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/sites", { cache: "no-store" });
    if (!res.ok) {
      setError("목록 로드 실패");
      setLoading(false);
      return;
    }
    setSites((await res.json()) as Site[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
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

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const d = (await res.json()) as { message?: string };
      setFormError(d.message ?? "저장 실패");
      setSaving(false);
      return;
    }

    await purgeSitesCache();
    cancelEdit();
    await load();
    setSaving(false);
  }

  async function handleToggleActive(site: Site) {
    await fetch(`/api/admin/sites/${site.seq}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: site.is_active === 0 }),
    });
    await purgeSitesCache();
    await load();
  }

  async function handleDelete(seq: number) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/admin/sites/${seq}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json()) as { message?: string };
      alert(d.message ?? "삭제 실패");
      return;
    }
    await purgeSitesCache();
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">사이트 관리</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setForm(EMPTY_FORM);
            setFormError("");
          }}
          className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded transition-colors"
        >
          + 사이트 추가
        </button>
      </div>

      {/* 모달 */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelEdit();
          }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">
                {editingId ? `사이트 수정 — #${editingId}` : "새 사이트 추가"}
              </h2>
              <button
                onClick={cancelEdit}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none"
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
                      <label className="block text-xs text-gray-400 mb-1 capitalize">
                        {field}
                      </label>
                      <input
                        type="text"
                        value={form[field]}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
                {formError && (
                  <p className="text-red-400 text-xs mt-2">{formError}</p>
                )}
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded transition-colors"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="text-gray-400 hover:text-gray-200 text-sm px-4 py-1.5 rounded transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>

              {/* 카드 미리보기 */}
              <div className="w-52 shrink-0">
                <p className="text-xs text-gray-500 mb-2">미리보기</p>
                <SiteCardPreview form={form} />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading ? (
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="py-2 pr-4 w-10">#</th>
                <th className="py-2 pr-4">이름</th>
                <th className="py-2 pr-4">URL</th>
                <th className="py-2 pr-4">설명</th>
                <th className="py-2 pr-4">카테고리</th>
                <th className="py-2 pr-4">활성</th>
                <th className="py-2">액션</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.seq}
                  className="border-b border-gray-800/50 hover:bg-gray-900/40"
                >
                  <td className="py-2 pr-4 text-gray-500">{site.seq}</td>
                  <td className="py-2 pr-4 text-white">{site.name}</td>
                  <td className="py-2 pr-4">
                    <a
                      href={site.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline truncate max-w-xs block"
                    >
                      {site.href}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {site.description ?? "-"}
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {site.category ?? "-"}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => handleToggleActive(site)}
                      className={`text-xs px-2 py-0.5 rounded ${
                        site.is_active
                          ? "bg-green-900/50 text-green-400"
                          : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      {site.is_active ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td className="py-2 flex gap-2">
                    <button
                      onClick={() => startEdit(site)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(site.seq)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
