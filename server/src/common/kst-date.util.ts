const KST_OFFSET_MS = 9 * 3600 * 1000;

/**
 * Date를 KST(Asia/Seoul) 기준 'YYYY-MM-DD' 문자열로 변환한다.
 * Date.toISOString()은 UTC라, 그대로 잘라 쓰면 KST 자정~오전 9시 사이에는
 * 하루 전 날짜로 잘못 계산된다 — +9시간 보정 후 잘라서 KST 기준 날짜를 얻는다.
 * (DST 없는 고정 오프셋 타임존이라 이 방식이 항상 정확하다.)
 */
export function kstDateString(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 지금(KST) 날짜를 'YYYY-MM-DD'로. */
export function todayKst(): string {
  return kstDateString(new Date());
}
