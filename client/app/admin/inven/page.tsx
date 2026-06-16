"use client";

import { useEffect, useRef, useState } from "react";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface SiteCandidate {
  id: number;
  url: string;
  domain: string;
  name: string;
  description: string;
  category: string;
  mention_count: number;
  sample_post_id: string | null;
  status: string;
  created_at: string;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/admin/inven${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    // 백엔드 에러 본문이 JSON이면 message만 추출해 사용자에게 노출
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: unknown };
      if (typeof j?.message === "string") msg = j.message;
    } catch {
      // JSON 아니면 원문 그대로
    }
    throw new Error(msg);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function AdminInvenPage() {
  // 게스트 권한 안내 (제목 아래 고정 표시)
  const [accessNotice, setAccessNotice] = useState("");
  const role = useAdminRole();
  const isGuest = role === "guest";

  // 쓰기 작업 전 게스트 차단. 차단되면 false 반환.
  const requireMaster = (action: string) => {
    if (!isGuest) return true;
    setAccessNotice(buildGuestNotice(action));
    return false;
  };

  return (
    <div className="space-y-4">
      <h1 className="admin-page-title">사이트 추천</h1>

      {accessNotice && (
        <pre className="whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {accessNotice}
        </pre>
      )}

      <CandidatesTab requireMaster={requireMaster} />
    </div>
  );
}

// ── 추천 사이트 탭 ────────────────────────────────────────────────────────────

type SiteForm = { name: string; href: string; category: string; description: string; icon: string };

const EMPTY_SITE_FORM: SiteForm = { name: "", href: "", category: "", description: "", icon: "" };

// 사이트 관리 탭과 동일한 카드 미리보기
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
            <img src={iconSrc} alt="" width={16} height={16} className="shrink-0 rounded-sm" />
          )}
          <span className="truncate font-semibold text-[color:var(--admin-text)] text-sm">
            {form.name || <span className="text-[color:var(--admin-text-subtle)]">이름</span>}
          </span>
        </div>
        <span className="admin-badge admin-badge-neutral">{form.category || "카테고리"}</span>
      </div>
      <p className="mt-1.5 text-xs text-[color:var(--admin-text-muted)] line-clamp-2">
        {form.description || <span className="text-[color:var(--admin-text-subtle)]">설명</span>}
      </p>
    </div>
  );
}

function CandidatesTab({ requireMaster }: { requireMaster: (action: string) => boolean }) {
  const [candidates, setCandidates] = useState<SiteCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  // 블랙리스트 등록 확인 모달 대상
  const [confirmTarget, setConfirmTarget] = useState<SiteCandidate | null>(null);
  // 사이트 추가 모달 대상 + 입력 폼
  const [addTarget, setAddTarget] = useState<SiteCandidate | null>(null);
  const [form, setForm] = useState<SiteForm>(EMPTY_SITE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // AI 추천 생성 후 모달을 채웠는지 표시 (안내 문구용)
  const [aiFilled, setAiFilled] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  // AI가 추천한 아이콘 (og:image 자동 fetch와 별도 보관 → 선택 UI)
  const [aiIcon, setAiIcon] = useState<string>("");
  // 자동 fetch로 가져온 기본 아이콘 (AI 선택 후에도 복구 가능하도록 보관)
  const [fetchedIcon, setFetchedIcon] = useState<string>("");
  // 경쟁 상태 방지: 현재 열린 후보 ID와 응답 대상 ID가 다르면 폼 갱신 무시.
  // 값은 setter의 함수형 업데이트(cur) 안에서만 읽으므로 값 바인딩은 생략.
  const [, setActiveFetchId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiFetch("/site-candidates?status=pending");
      setCandidates((d.candidates as SiteCandidate[]) ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 백드롭 클릭으로 모달을 닫되, "프레스를 백드롭에서 시작"한 경우에만 닫는다.
  // (입력칸 텍스트를 드래그 선택하다 마우스를 백드롭에서 떼면 click 타깃이
  //  오버레이가 되어 의도치 않게 닫히는 문제 방지)
  // 모달별로 ref를 분리해 서로 영향을 주지 않게 한다.
  const addOverlayPressOnSelf = useRef(false);
  const confirmOverlayPressOnSelf = useRef(false);

  // "+ 사이트 추가" → 모달 열고 후보 정보로 폼 채우기 (URL은 도메인 루트)
  const openAddModal = (c: SiteCandidate) => {
    if (!requireMaster("사이트 추가")) return;
    setAddTarget(c);
    setAiFilled(false);
    setForm({
      name: c.name || "",
      href: c.url,
      category: c.category || "",
      description: c.description || "",
      icon: "",
    });
    setFormError("");
    setActiveFetchId(c.id);
    // 모달 열리자마자 og:image 자동 fetch (Gemini 없이)
    apiFetch(`/site-candidates/${c.id}/icon`)
      .then((res) => {
        setActiveFetchId((cur) => {
          if (cur === c.id && res.icon) {
            const iconUrl = res.icon as string;
            setForm((p) => ({ ...p, icon: iconUrl }));
            setFetchedIcon(iconUrl);
          }
          return cur;
        });
      })
      .catch(() => {});
  };

  // 모달 안 "✨ AI 추천" → Gemini 호출(클릭 시에만) → 폼 자동 채움
  const runAiSuggest = async () => {
    if (!addTarget) return;
    setSuggesting(true);
    setFormError("");
    try {
      const s = await apiFetch(`/site-candidates/${addTarget.id}/suggest`, { method: "POST" });
      setForm((p) => ({
        ...p,
        name: (s.name as string) || p.name,
        category: (s.category as string) || p.category,
        description: (s.description as string) || p.description,
      }));
      if (s.icon) setAiIcon(s.icon as string);
      setAiFilled(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "AI 추천 실패");
    } finally {
      setSuggesting(false);
    }
  };

  const closeAddModal = () => {
    setAddTarget(null);
    setForm(EMPTY_SITE_FORM);
    setFormError("");
    setAiFilled(false);
    setSuggesting(false);
    setAiIcon("");
    setFetchedIcon("");
    setActiveFetchId(null);
  };

  // 모달 저장 → 후보 승인 API (loa_sites 등록 + status=added)
  const submitAdd = async () => {
    if (!addTarget) return;
    if (!form.name.trim() || !form.href.trim()) {
      setFormError("이름과 URL은 필수입니다");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await apiFetch(`/site-candidates/${addTarget.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          href: form.href,
          category: form.category,
          description: form.description,
          icon: form.icon,
        }),
      });
      setCandidates((prev) => prev.filter((x) => x.id !== addTarget.id));
      closeAddModal();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  };

  // 블랙리스트 등록 실행
  const confirmReject = async () => {
    const c = confirmTarget;
    if (!c) return;
    setConfirmTarget(null);
    setBusyId(c.id);
    try {
      await apiFetch(`/site-candidates/${c.id}/reject`, { method: "POST" });
      setCandidates((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "블랙리스트 등록 실패");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="admin-page-subtitle">불러오는 중...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[color:var(--admin-muted)]">
          검토 대기 {candidates.length}개
        </p>
        <button onClick={load} className="text-xs text-blue-500 hover:underline">
          새로고침
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {candidates.length === 0 && (
        <div className="admin-card p-6 text-center">
          <p className="admin-page-subtitle">검토할 추천 사이트가 없습니다.</p>
          <p className="text-xs text-[color:var(--admin-muted)] mt-2">
            수집이 돌면 인벤에서 언급된 새 사이트 후보가 여기에 모입니다.
          </p>
        </div>
      )}

      {/* 후보 카드 (도메인 + 언급 횟수 + 버튼) */}
      <div className="space-y-2">
        {candidates.map((c) => (
          <div key={c.id} className="admin-card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-blue-600 hover:underline"
                >
                  {c.domain}
                </a>
                <span className="text-[10px] text-[color:var(--admin-muted)]">
                  언급 {c.mention_count}회
                </span>
              </div>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[color:var(--admin-muted)] hover:underline block truncate mt-0.5"
              >
                {c.url}
              </a>
            </div>

            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => {
                  if (!requireMaster("블랙리스트 등록")) return;
                  setConfirmTarget(c);
                }}
                disabled={busyId === c.id}
                className="admin-btn admin-btn-secondary text-xs px-3 py-1 whitespace-nowrap"
              >
                블랙리스트 등록
              </button>
              <button
                onClick={() => openAddModal(c)}
                disabled={busyId === c.id}
                className="admin-btn admin-btn-primary text-xs px-3 py-1 whitespace-nowrap"
              >
                + 사이트 추가
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 사이트 추가 모달 (사이트 관리 탭과 동일 형식) */}
      {addTarget && (
        <div
          className="admin-modal-overlay"
          onMouseDown={(e) => {
            addOverlayPressOnSelf.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            // mousedown·click 모두 오버레이 자신에서 일어난 진짜 백드롭 클릭만 닫기
            if (
              !saving &&
              e.target === e.currentTarget &&
              addOverlayPressOnSelf.current
            ) {
              closeAddModal();
            }
            addOverlayPressOnSelf.current = false;
          }}
        >
          <div className="admin-modal w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[color:var(--admin-text)]">
                새 사이트 추가 · {addTarget.domain}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={runAiSuggest}
                  disabled={saving || suggesting}
                  className="admin-btn admin-btn-secondary text-xs px-3 py-1 whitespace-nowrap"
                  title="Gemini로 이름·카테고리·설명·아이콘을 추천받아 폼을 채웁니다"
                >
                  {suggesting ? "AI 추천 중..." : "✨ AI 추천"}
                </button>
                <button
                  onClick={closeAddModal}
                  disabled={saving}
                  className="text-[color:var(--admin-text-subtle)] hover:text-[color:var(--admin-text)] text-lg leading-none"
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
                  {(["name", "href", "category", "description", "icon"] as const).map((field) => (
                    <div key={field} className={field === "description" ? "col-span-2" : ""}>
                      <label className="admin-label capitalize">{field}</label>
                      <input
                        type="text"
                        value={form[field]}
                        disabled={saving}
                        onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
                        className="admin-input"
                      />
                      {field === "icon" && aiIcon && aiIcon !== fetchedIcon && (
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-xs text-[color:var(--admin-text-muted)]">아이콘 선택</span>
                          {[{ src: fetchedIcon, label: "기본" }, { src: aiIcon, label: "AI" }].map(({ src, label }) => (
                            src ? (
                              <button
                                key={label}
                                type="button"
                                onClick={() => setForm((p) => ({ ...p, icon: src }))}
                                className={`flex flex-col items-center gap-0.5 rounded border px-2 py-1 text-xs transition-colors ${
                                  form.icon === src
                                    ? "border-blue-400 bg-blue-50 text-blue-700"
                                    : "border-[color:var(--admin-border)] text-[color:var(--admin-text-muted)] hover:border-blue-300"
                                }`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt="" width={20} height={20} className="rounded-sm" />
                                {label}
                              </button>
                            ) : null
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {formError && <p className="text-red-500 text-xs mt-2">{formError}</p>}
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={submitAdd}
                    disabled={saving}
                    className="admin-btn admin-btn-primary"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={closeAddModal}
                    disabled={saving}
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

      {/* 블랙리스트 등록 확인 모달 */}
      {confirmTarget && (
        <div
          className="admin-modal-overlay"
          onMouseDown={(e) => {
            confirmOverlayPressOnSelf.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && confirmOverlayPressOnSelf.current) {
              setConfirmTarget(null);
            }
            confirmOverlayPressOnSelf.current = false;
          }}
        >
          <div className="admin-modal max-w-md w-[90%] p-5 space-y-4">
            <p className="text-sm font-medium">블랙리스트 등록</p>
            <div className="text-sm text-[color:var(--admin-text)] space-y-1">
              <p>아래 사이트를 블랙리스트에 등록할까요?</p>
              <p className="font-bold text-blue-600">{confirmTarget.domain}</p>
              <p className="text-xs text-[color:var(--admin-text-muted)] break-all">
                {confirmTarget.url}
              </p>
              <p className="text-xs text-[color:var(--admin-text-muted)] mt-1">
                등록하면 추천 목록에서 사라지고, 다음 수집부터 다시 뜨지 않습니다.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmTarget(null)}
                className="admin-btn admin-btn-secondary text-xs px-4 py-1"
              >
                아니오
              </button>
              <button
                onClick={confirmReject}
                className="admin-btn admin-btn-primary text-xs px-4 py-1"
              >
                예, 등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
