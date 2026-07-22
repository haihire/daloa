"use client";

/**
 * 브라우저가 자기 방문 이력만 세어두는 카운터.
 *
 * 식별자를 만들지 않는 게 핵심이다 — 저장하는 건 "몇 날, 몇 번 왔는가"뿐이라
 * 서버는 피드백 작성자가 단골인지 뜨내기인지만 알 수 있고, 두 피드백이 같은
 * 사람 것인지는 알 수 없다.
 *
 * 한계: 캐시 삭제/기기 변경/시크릿창에서 초기화되고, 클라이언트 값이라 조작 가능하다.
 */

export const VISIT_STATS_KEY = "loa_visit_stats";

export interface VisitStats {
  /** 첫 방문일 (YYYY-MM-DD) */
  firstSeenAt: string;
  /** 마지막 방문일 (YYYY-MM-DD) — 날짜가 바뀔 때만 days를 올리기 위해 필요 */
  lastVisitDay: string;
  /** 방문한 날짜 수. 같은 날 여러 번 와도 1 */
  days: number;
  /** 페이지가 열린 누적 횟수 */
  total: number;
}

/** 서버 집계(Asia/Seoul)와 기준을 맞춘 오늘 날짜. sv-SE 로케일이 YYYY-MM-DD를 준다. */
function seoulToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function isDayString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readVisitStats(): VisitStats | null {
  try {
    const raw = localStorage.getItem(VISIT_STATS_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { firstSeenAt, lastVisitDay, days, total } = parsed as
      Partial<VisitStats>;
    if (
      !isDayString(firstSeenAt) ||
      !isDayString(lastVisitDay) ||
      !isCount(days) ||
      !isCount(total)
    ) {
      return null;
    }
    return { firstSeenAt, lastVisitDay, days, total };
  } catch {
    return null;
  }
}

/** 방문 1회 기록. days는 날짜가 바뀐 경우에만 오른다. */
export function recordVisit(): VisitStats {
  const day = seoulToday();
  const current = readVisitStats();

  const next: VisitStats = current
    ? {
        firstSeenAt: current.firstSeenAt,
        lastVisitDay: day,
        days: current.lastVisitDay === day ? current.days : current.days + 1,
        total: current.total + 1,
      }
    : { firstSeenAt: day, lastVisitDay: day, days: 1, total: 1 };

  try {
    localStorage.setItem(VISIT_STATS_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패해도 방문 자체는 계속돼야 한다
  }
  return next;
}
