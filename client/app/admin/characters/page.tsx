"use client";

import { useCallback, useEffect, useState } from "react";

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
  "신치",
  "치특",
  "특치",
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page);
  }, [load, page]);

  function handleSearch() {
    setPage(1);
    void load(1);
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 1;

  return (
    <div
      className="flex flex-col h-full"
      style={{ maxHeight: "calc(100vh - 64px)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">캐릭터 목록</h1>
        <span className="text-xs text-gray-500">
          총 {result?.total.toLocaleString() ?? "-"}명
        </span>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-3 flex-wrap shrink-0">
        <input
          type="text"
          placeholder="캐릭터명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 w-48"
        />
        <input
          type="text"
          placeholder="직업 (예: 버서커)"
          value={classDetail}
          onChange={(e) => setClassDetail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 w-40"
        />
        <select
          value={statBuild}
          onChange={(e) => setStatBuild(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          {STAT_BUILDS.map((b) => (
            <option key={b} value={b}>
              {b || "전체 빌드"}
            </option>
          ))}
        </select>
        <button
          onClick={handleSearch}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-1.5 rounded transition-colors"
        >
          검색
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-3 shrink-0">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "36px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "60px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "60px" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-center">
                  <th className="py-2">#</th>
                  <th className="py-2">캐릭터명</th>
                  <th className="py-2">아이템레벨</th>
                  <th className="py-2">전투력</th>
                  <th className="py-2">서버</th>
                  <th className="py-2">직업</th>
                  <th className="py-2">각인</th>
                  <th className="py-2">태양코어</th>
                  <th className="py-2">달코어</th>
                  <th className="py-2">별코어</th>
                  <th className="py-2">빌드</th>
                </tr>
              </thead>
              <tbody>
                {result?.items.map((c, idx) => (
                  <tr
                    key={c.name}
                    className="border-b border-gray-800/50 hover:bg-gray-900/40"
                  >
                    <td className="py-1.5 text-gray-600 text-center text-xs">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="py-1.5 text-white font-medium text-center truncate overflow-hidden">
                      {c.name}
                    </td>
                    <td className="py-1.5 text-center text-gray-200 tabular-nums text-xs">
                      {c.level.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-center text-yellow-300 tabular-nums text-xs">
                      {c.combatPower != null
                        ? c.combatPower.toLocaleString()
                        : "-"}
                    </td>
                    <td className="py-1.5 text-center text-gray-400 text-xs truncate overflow-hidden">
                      {c.server ?? "-"}
                    </td>
                    <td className="py-1.5 text-center text-gray-300 text-xs truncate overflow-hidden">
                      {c.classDetail ?? "-"}
                    </td>
                    <td className="py-1.5 text-center text-gray-400 text-xs truncate overflow-hidden">
                      {c.classEngraving ?? "-"}
                    </td>
                    <td className="py-1.5 text-center text-yellow-400 text-xs truncate overflow-hidden">
                      {c.coreSun ?? "-"}
                    </td>
                    <td className="py-1.5 text-center text-blue-400 text-xs truncate overflow-hidden">
                      {c.coreMoon ?? "-"}
                    </td>
                    <td className="py-1.5 text-center text-purple-400 text-xs truncate overflow-hidden">
                      {c.coreStar ?? "-"}
                    </td>
                    <td className="py-1.5 text-center">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          c.statBuild === "미설정"
                            ? "bg-gray-800 text-gray-500"
                            : "bg-indigo-900/50 text-indigo-300"
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

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-3 justify-center shrink-0">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              >
                이전
              </button>
              <span className="text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
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
