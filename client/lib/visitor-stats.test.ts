import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { VISIT_STATS_KEY, readVisitStats, recordVisit } from "./visitor-stats";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// 서울(UTC+9) 기준 시각 참고:
//   03:00Z → 당일 12:00 서울
//   13:00Z → 당일 22:00 서울
//   16:00Z → 다음날 01:00 서울
const JUL21_NOON = new Date("2026-07-21T03:00:00Z");
const JUL21_NIGHT = new Date("2026-07-21T13:00:00Z");
const JUL22_EARLY = new Date("2026-07-21T16:00:00Z");

describe("visitor-stats", () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorageMock.clear();
  });

  it("첫 방문이면 days와 total이 1에서 시작한다", () => {
    vi.setSystemTime(JUL21_NOON);

    expect(recordVisit()).toEqual({
      firstSeenAt: "2026-07-21",
      lastVisitDay: "2026-07-21",
      days: 1,
      total: 1,
    });
  });

  it("같은 날 다시 방문하면 total만 오르고 days는 그대로다", () => {
    vi.setSystemTime(JUL21_NOON);
    recordVisit();

    vi.setSystemTime(JUL21_NIGHT);
    const stats = recordVisit();

    expect(stats.days).toBe(1);
    expect(stats.total).toBe(2);
  });

  it("다음날 다시 방문하면 days가 오르고 첫 방문일은 유지된다", () => {
    vi.setSystemTime(JUL21_NOON);
    recordVisit();

    vi.setSystemTime(JUL22_EARLY);
    const stats = recordVisit();

    expect(stats.days).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.firstSeenAt).toBe("2026-07-21");
    expect(stats.lastVisitDay).toBe("2026-07-22");
  });

  it("UTC가 아니라 서울 날짜로 하루를 가른다", () => {
    // UTC로는 둘 다 7/21이지만 서울로는 7/21 밤과 7/22 새벽이라 다른 날이다
    vi.setSystemTime(JUL21_NIGHT);
    expect(recordVisit().lastVisitDay).toBe("2026-07-21");

    vi.setSystemTime(JUL22_EARLY);
    const stats = recordVisit();

    expect(stats.lastVisitDay).toBe("2026-07-22");
    expect(stats.days).toBe(2);
  });

  it("여러 날에 걸쳐 방문하면 날짜 수만큼 days가 쌓인다", () => {
    for (let day = 1; day <= 5; day += 1) {
      vi.setSystemTime(new Date(`2026-07-0${day}T03:00:00Z`));
      recordVisit();
      // 같은 날 새로고침은 days에 영향이 없어야 한다
      recordVisit();
    }

    const stats = readVisitStats();
    expect(stats?.days).toBe(5);
    expect(stats?.total).toBe(10);
  });

  it("저장값이 깨져 있으면 null을 돌려준다", () => {
    localStorage.setItem(VISIT_STATS_KEY, "{망가진 JSON");

    expect(readVisitStats()).toBeNull();
  });

  it("형식이 맞지 않는 저장값은 무시한다", () => {
    localStorage.setItem(
      VISIT_STATS_KEY,
      JSON.stringify({ firstSeenAt: "어제", days: "많이", total: 3 }),
    );

    expect(readVisitStats()).toBeNull();
  });

  it("깨진 저장값 위에 방문하면 처음부터 다시 센다", () => {
    localStorage.setItem(VISIT_STATS_KEY, "{망가진 JSON");
    vi.setSystemTime(JUL21_NOON);

    expect(recordVisit()).toEqual({
      firstSeenAt: "2026-07-21",
      lastVisitDay: "2026-07-21",
      days: 1,
      total: 1,
    });
  });
});
