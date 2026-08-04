/**
 * 크론이 건당 개별 upsert 를 돌리면(N+1) 행 수만큼 DB 왕복이 순차로 쌓여, 같은
 * 이벤트루프에서 도는 다른 크론과 겹칠 때 nest CPU 가 통째로 튄다.
 * 한 번의 `INSERT ... VALUES (...),(...) ON CONFLICT` 로 묶으면 왕복이 1회로 줄어든다.
 *
 * 다만 한 방에 다 보내면 안 된다 — Postgres 는 쿼리당 파라미터가 65,535 개로 제한되고,
 * 본문처럼 큰 텍스트가 섞이면 쿼리 문자열 자체가 커진다. 그래서 청크로 끊어 보낸다.
 */

/** 배열을 size 개씩 끊는다. 빈 배열이면 빈 결과. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
