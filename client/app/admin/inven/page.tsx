"use client";

import { useEffect, useRef, useState } from "react";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";
import { useSiteCategories } from "@/lib/site-categories";
import SiteFormModal, {
  EMPTY_SITE_FORM,
  type SiteForm,
} from "@/components/admin/SiteFormModal";

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
      {/* 안내는 absolute로 제목 오른쪽에 띄운다 — 떠도 아래 리스트가 밀리지 않게(레이아웃에서 빠짐) */}
      <div className="relative w-fit">
        <h1 className="admin-page-title">사이트 추천</h1>
        {accessNotice && (
          <pre className="absolute left-full top-1/2 my-0 ml-6 -translate-y-1/2 whitespace-pre rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs leading-tight text-amber-800">
            {accessNotice}
          </pre>
        )}
      </div>

      <CandidatesTab requireMaster={requireMaster} />
    </div>
  );
}

// ── 추천 사이트 탭 ────────────────────────────────────────────────────────────

function CandidatesTab({
  requireMaster,
}: {
  requireMaster: (action: string) => boolean;
}) {
  const categories = useSiteCategories();
  const [candidates, setCandidates] = useState<SiteCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  // 블랙리스트 등록 확인 모달 대상
  const [confirmTarget, setConfirmTarget] = useState<SiteCandidate | null>(
    null,
  );
  // 사이트 추가 모달 대상 + 입력 폼 (모달 UI 는 SiteFormModal 공용 컴포넌트)
  const [addTarget, setAddTarget] = useState<SiteCandidate | null>(null);
  const [form, setForm] = useState<SiteForm>(EMPTY_SITE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // 언급 1회짜리 후보까지 볼지 (기본은 2회 이상 — 1회성 뉴스·쇼핑 링크 노이즈가 많다)
  const [includeSingle, setIncludeSingle] = useState(false);

  const load = async (minMentions = includeSingle ? 1 : 2) => {
    setLoading(true);
    try {
      const d = await apiFetch(
        `/site-candidates?status=pending&minMentions=${minMentions}`,
      );
      setCandidates((d.candidates as SiteCandidate[]) ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(includeSingle ? 1 : 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSingle]);

  // 백드롭 클릭으로 모달을 닫되, "프레스를 백드롭에서 시작"한 경우에만 닫는다.
  // (입력칸 텍스트를 드래그 선택하다 마우스를 백드롭에서 떼면 click 타깃이
  //  오버레이가 되어 의도치 않게 닫히는 문제 방지)
  const confirmOverlayPressOnSelf = useRef(false);

  // "+ 사이트 추가" → 모달 열고 후보 정보로 폼 채우기 (URL은 도메인 루트)
  // name·icon 자동 조회와 AI 추천은 SiteFormModal 이 href 기준으로 처리한다.
  const openAddModal = (c: SiteCandidate) => {
    if (!requireMaster("사이트 추가")) return;
    setAddTarget(c);
    setForm({
      name: c.name || "",
      href: c.domain ? `https://${c.domain}` : c.url || "",
      // 후보의 옛 카테고리가 고정 목록 밖이면 빈값으로 — select에 없는 값이 저장돼 CHECK 위반하는 것 방지
      category: categories.includes(c.category) ? c.category : "",
      description: c.description || "",
      icon: "",
    });
    setFormError("");
  };

  const closeAddModal = () => {
    setAddTarget(null);
    setForm(EMPTY_SITE_FORM);
    setFormError("");
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-[color:var(--admin-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={includeSingle}
              onChange={(e) => setIncludeSingle(e.target.checked)}
              className="cursor-pointer"
            />
            1회 언급 포함
          </label>
          <button
            onClick={() => load()}
            className="text-xs text-blue-500 hover:underline"
          >
            새로고침
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {candidates.length === 0 && (
        <div className="admin-card p-6 text-center">
          <p className="admin-page-subtitle">검토할 추천 사이트가 없습니다.</p>
          <p className="text-xs text-[color:var(--admin-muted)] mt-2">
            수집이 돌면 인벤에서 언급된 신규 사이트 후보가 여기에 모입니다.
          </p>
          {!includeSingle && (
            <p className="text-xs text-[color:var(--admin-muted)] mt-1">
              언급 1회짜리는 기본으로 숨겨집니다 — 위 &quot;1회 언급 포함&quot;을
              켜보세요.
            </p>
          )}
        </div>
      )}

      {/* 후보 카드 (도메인 + 언급 횟수 + 버튼) */}
      <div className="space-y-2">
        {candidates.map((c) => (
          <div
            key={c.id}
            className="admin-card p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={c.domain ? `https://${c.domain}` : "#"}
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
                href={c.domain ? `https://${c.domain}` : "#"}
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

      {/* 사이트 추가 모달 — 사이트 관리(수정)와 같은 공용 컴포넌트 */}
      <SiteFormModal
        open={addTarget !== null}
        title={`신규 사이트 추가`}
        form={form}
        setForm={setForm}
        categories={categories}
        saving={saving}
        error={formError}
        setError={setFormError}
        onSave={submitAdd}
        onClose={closeAddModal}
        autoFetchMeta
      />

      {/* 블랙리스트 등록 확인 모달 */}
      {confirmTarget && (
        <div
          className="admin-modal-overlay"
          onMouseDown={(e) => {
            confirmOverlayPressOnSelf.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (
              e.target === e.currentTarget &&
              confirmOverlayPressOnSelf.current
            ) {
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
                등록하면 추천 목록에서 사라지고, 다음 수집부터 다시 뜨지
                않습니다.
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
