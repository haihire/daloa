"use client";

import { useEffect, useRef, useState } from "react";

export interface SiteForm {
  name: string;
  href: string;
  category: string;
  description: string;
  icon: string;
}

export const EMPTY_SITE_FORM: SiteForm = {
  name: "",
  href: "",
  category: "",
  description: "",
  icon: "",
};

/** 저장했을 때 홈에 어떻게 보일지 그대로 보여주는 카드 미리보기 */
function SiteCardPreview({ form }: { form: SiteForm }) {
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

interface Props {
  open: boolean;
  title: string;
  form: SiteForm;
  setForm: React.Dispatch<React.SetStateAction<SiteForm>>;
  categories: string[];
  saving: boolean;
  error: string;
  setError: (message: string) => void;
  onSave: () => void;
  onClose: () => void;
  /**
   * 열릴 때 href 로 name·icon 을 자동으로 채운다(신규 사이트 추가용).
   * 수정에서는 꺼야 한다 — 이미 정해둔 이름이 자동 추출값으로 덮어써지면 곤란하다.
   */
  autoFetchMeta?: boolean;
  /** 저장 외에 폼을 잠가야 하는 상황(예: 목록 반영 대기 중) */
  disabled?: boolean;
}

/**
 * 사이트 추가·수정 공용 모달.
 *
 * 사이트 관리(수정/추가)와 사이트 추천의 "신규 사이트 추가"가 같은 화면을 쓴다.
 * 저장 동작만 다르므로(추천은 후보 승인, 관리는 생성/수정) onSave 로 주입받는다.
 *
 * AI 추천·아이콘 조회는 후보 id 가 아니라 href 로 동작하는 URL 기반 API 를 쓴다
 * — 그래야 후보가 없는 "기존 사이트 수정"에서도 같은 기능을 쓸 수 있다.
 */
export default function SiteFormModal({
  open,
  title,
  form,
  setForm,
  categories,
  saving,
  error,
  setError,
  onSave,
  onClose,
  autoFetchMeta = false,
  disabled = false,
}: Props) {
  const [suggesting, setSuggesting] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [aiFilled, setAiFilled] = useState(false);

  // 백드롭 클릭으로 닫되, "프레스를 백드롭에서 시작"한 경우에만 닫는다.
  // (입력칸 텍스트를 드래그하다 마우스를 백드롭에서 떼면 click 타깃이 오버레이가 되어
  //  의도치 않게 닫히는 문제 방지)
  const overlayPressOnSelf = useRef(false);
  // 자동 조회는 "열릴 때 한 번"만 한다. href 를 의존성에 넣으면 사용자가 주소를
  // 고칠 때마다 이름·아이콘이 되돌아가 버리므로, 값은 ref 로만 읽는다.
  const hrefRef = useRef(form.href);
  hrefRef.current = form.href;

  const busy = saving || suggesting || fetchingMeta || disabled;

  // 모달이 닫히면 보조 상태를 초기화한다 (다음에 열 때 이전 안내가 남지 않도록)
  useEffect(() => {
    if (!open) {
      setSuggesting(false);
      setFetchingMeta(false);
      setAiFilled(false);
    }
  }, [open]);

  // 신규 사이트 추가일 때만, 열리자마자 href 로 name·icon 자동 조회 (AI 호출 없음)
  useEffect(() => {
    if (!open || !autoFetchMeta) return;
    const href = hrefRef.current.trim();
    if (!href) return;

    let cancelled = false;
    setFetchingMeta(true);
    fetch(`/api/admin/sites/meta?url=${encodeURIComponent(href)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { name?: string; icon?: string } | null) => {
        if (cancelled || !data) return;
        setForm((p) => ({
          ...p,
          ...(data.name ? { name: data.name } : {}),
          ...(data.icon ? { icon: data.icon } : {}),
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetchingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, autoFetchMeta, setForm]);

  /** href 의 favicon 만 다시 가져온다 (이름은 비어 있을 때만 채움) */
  async function fetchIcon() {
    const href = form.href.trim();
    if (!href) {
      setError("아이콘을 가져오려면 href 를 먼저 입력하세요.");
      return;
    }
    setFetchingMeta(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/sites/meta?url=${encodeURIComponent(href)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        name?: string;
        icon?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.message ?? "아이콘 조회 실패");
      setForm((p) => ({
        ...p,
        icon: data.icon ?? p.icon,
        name: p.name.trim() ? p.name : (data.name ?? ""),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "아이콘 조회 실패");
    } finally {
      setFetchingMeta(false);
    }
  }

  /** "✨ AI 추천" — 클릭할 때만 AI 호출(토큰 보호). 카테고리·설명만 채운다. */
  async function runAiSuggest() {
    const href = form.href.trim();
    if (!href) {
      setError("AI 추천을 받으려면 href 를 먼저 입력하세요.");
      return;
    }
    setSuggesting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sites/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: href }),
      });
      const data = (await res.json()) as {
        category?: string;
        description?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.message ?? "AI 추천 실패");
      setForm((p) => ({
        ...p,
        category: data.category ?? p.category,
        description: data.description ?? p.description,
      }));
      setAiFilled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 추천 실패");
    } finally {
      setSuggesting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="admin-modal-overlay"
      onMouseDown={(e) => {
        overlayPressOnSelf.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          !busy &&
          e.target === e.currentTarget &&
          overlayPressOnSelf.current
        ) {
          onClose();
        }
        overlayPressOnSelf.current = false;
      }}
    >
      <div className="admin-modal w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[color:var(--admin-text)]">
            {title}
          </h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={runAiSuggest}
              disabled={busy}
              className="admin-btn admin-btn-secondary text-xs px-3 py-1 whitespace-nowrap"
              title="AI로 카테고리·설명을 추천받아 채웁니다 (이름·아이콘은 자동)"
            >
              {suggesting ? "AI 추천 중..." : "✨ AI 추천"}
            </button>
            {/* admin-btn 은 height 36px 고정 — 같은 클래스를 줘서 AI 추천 버튼과 높이를 맞춘다 */}
            <button
              type="button"
              onClick={onClose}
              disabled={saving || disabled}
              aria-label="닫기"
              title="닫기"
              className="admin-btn admin-btn-secondary px-3 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {aiFilled && (
          <p className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
            ✨ AI가 추천한 값으로 채웠습니다. 검토 후 수정해서 저장하세요.
          </p>
        )}

        <div className="flex gap-6">
          {/* 폼 */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-2 gap-4">
              {(
                ["name", "href", "category", "description", "icon"] as const
              ).map((field) => (
                <div
                  key={field}
                  className={
                    field === "description" || field === "icon"
                      ? "col-span-2"
                      : ""
                  }
                >
                  <label className="admin-label capitalize">{field}</label>
                  {field === "category" ? (
                    // 자유 입력이면 카테고리가 난립하고 loa_sites CHECK 도 위반한다 — 고정 목록에서만.
                    <select
                      value={form.category}
                      disabled={busy}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, category: e.target.value }))
                      }
                      className="admin-select"
                    >
                      <option value="">선택 안 함</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : field === "icon" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={form.icon}
                        disabled={busy}
                        placeholder="비우면 favicon 자동 사용"
                        onChange={(e) =>
                          setForm((p) => ({ ...p, icon: e.target.value }))
                        }
                        className="admin-input flex-1 min-w-0"
                      />
                      <button
                        type="button"
                        onClick={fetchIcon}
                        disabled={busy}
                        title="href 의 favicon 을 가져옵니다 (AI 호출 없음)"
                        className="admin-btn admin-btn-sm admin-btn-secondary shrink-0 whitespace-nowrap"
                      >
                        {fetchingMeta ? "가져오는 중..." : "가져오기"}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={form[field]}
                      disabled={busy}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [field]: e.target.value }))
                      }
                      className="admin-input"
                    />
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={onSave}
                disabled={busy}
                className="admin-btn admin-btn-primary"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving || disabled}
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
  );
}
