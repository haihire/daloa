"use client";

import { useCallback, useEffect, useState } from "react";
import { buildGuestNotice, useAdminRole } from "@/lib/admin-role";

interface Character {
  name: string;
  server: string;
  level: number;
  combatPower: number | null;
  classDetail: string | null;
  classEngraving: string | null;
  statCrit: number;
  statSpec: number;
  statSwift: number;
  statBuild: string;
  thesix: boolean;
  coreSun: string | null;
  coreMoon: string | null;
  coreStar: string | null;
}

interface ListResult {
  total: number;
  page: number;
  pageSize: number;
  items: Character[];
}

const STAT_BUILDS = [
  "",
  "치신",
  "특치",
  "치특",
  "신치",
  "신특",
  "특신",
  "치특신",
  "미설정",
];
const PAGE_SIZE = 20;

export default function AdminCharactersPage() {
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessNotice, setAccessNotice] = useState("");
  const role = useAdminRole();
  const isGuest = role === "guest";

  const [search, setSearch] = useState("");
  const [statBuild, setStatBuild] = useState("");
  const [classDetail, setClassDetail] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (p = page) => {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        ...(search && { search }),
        ...(statBuild && { statBuild }),
        ...(classDetail && { classDetail }),
      });
      const res = await fetch(`/api/admin/characters?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("데이터 로드 실패");
        setLoading(false);
        return;
      }
      setResult((await res.json()) as ListResult);
      setLoading(false);
    },
    [page, search, statBuild, classDetail],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  function handleSearch() {
    setPage(1);
    void load(1);
  }

  const [purging, setPurging] = useState(false);

  function requireMaster(action: string) {
    if (!isGuest) return true;
    setAccessNotice(buildGuestNotice(action));
    return false;
  }

  async function handlePurge() {
    if (!requireMaster("캐릭터 캐시 새로고침")) return;
    setPurging(true);
    try {
      await fetch("/api/admin/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "characters" }),
      });
      alert("캐릭터 캐시가 무효화됐습니다.");
    } finally {
      setPurging(false);
    }
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 1;

  return (
    <div
      className="flex flex-col h-full"
      style={{ maxHeight: "calc(100vh - 64px)" }}
    >
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 shrink-0">
        <div>
          <h1 className="admin-page-title">캐릭터 목록</h1>
          <p className="admin-page-subtitle mt-1">
            총 {result?.total.toLocaleString() ?? "-"}명의 캐릭터가 등록되어
            있습니다.
          </p>
          {accessNotice && (
            <pre className="mt-3 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {accessNotice}
            </pre>
          )}
        </div>
        <button
          onClick={handlePurge}
          disabled={purging}
          className="admin-btn admin-btn-secondary"
          title="Redis 캐릭터 캐시 즉시 삭제"
        >
          {purging ? "처리 중..." : "캐시 새로고침"}
        </button>
      </div>

      {/* 필터 */}
      <div className="admin-card admin-card-padded mb-4 shrink-0">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="w-48">
            <label className="admin-label">캐릭터명</label>
            <input
              type="text"
              placeholder="검색어 입력"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="admin-input"
            />
          </div>
          <div className="w-40">
            <label className="admin-label">직업</label>
            <input
              type="text"
              placeholder="예: 버서커"
              value={classDetail}
              onChange={(e) => setClassDetail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="admin-input"
            />
          </div>
          <div className="w-36">
            <label className="admin-label">빌드</label>
            <select
              value={statBuild}
              onChange={(e) => setStatBuild(e.target.value)}
              className="admin-select"
            >
              {STAT_BUILDS.map((b) => (
                <option key={b} value={b}>
                  {b || "전체 빌드"}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSearch}
            className="admin-btn admin-btn-primary"
          >
            검색
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-3 shrink-0">{error}</p>}

      {loading ? (
        <div className="admin-card admin-card-padded text-center">
          <p className="text-sm text-[color:var(--admin-text-muted)]">
            불러오는 중...
          </p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="admin-card overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-auto flex-1">
              <table className="admin-table table-fixed">
                <colgroup>
                  <col style={{ width: "44px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "80px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "80px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "180px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "80px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-center">#</th>
                    <th>캐릭터명</th>
                    <th className="text-center">아이템</th>
                    <th className="text-center">전투력</th>
                    <th>서버</th>
                    <th>직업</th>
                    <th>각인</th>
                    <th>해코어</th>
                    <th>달코어</th>
                    <th>별코어</th>
                    <th className="text-center">빌드</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.map((c, idx) => (
                    <tr key={c.name}>
                      <td className="text-center text-[color:var(--admin-text-subtle)] tabular-nums">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="font-medium truncate">{c.name}</td>
                      <td className="text-center tabular-nums">
                        {c.level.toLocaleString()}
                      </td>
                      <td className="text-center tabular-nums text-amber-600 font-medium">
                        {c.combatPower != null
                          ? c.combatPower.toLocaleString()
                          : "-"}
                      </td>
                      <td className="text-[color:var(--admin-text-muted)] truncate">
                        {c.server ?? "-"}
                      </td>
                      <td className="truncate">{c.classDetail ?? "-"}</td>
                      <td className="text-[color:var(--admin-text-muted)] text-xs truncate">
                        {c.classEngraving ?? "-"}
                      </td>
                      <td className="text-amber-600 text-xs truncate">
                        {c.coreSun ?? "-"}
                      </td>
                      <td className="text-blue-600 text-xs truncate">
                        {c.coreMoon ?? "-"}
                      </td>
                      <td className="text-violet-600 text-xs truncate">
                        {c.coreStar ?? "-"}
                      </td>
                      <td className="text-center">
                        <span
                          className={`admin-badge ${
                            c.statBuild === "미설정"
                              ? "admin-badge-neutral"
                              : "admin-badge-info"
                          }`}
                        >
                          {c.statBuild}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3 mt-4 justify-center shrink-0">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="admin-btn admin-btn-sm admin-btn-secondary"
              >
                이전
              </button>
              <span className="text-xs text-[color:var(--admin-text-muted)] tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="admin-btn admin-btn-sm admin-btn-secondary"
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
