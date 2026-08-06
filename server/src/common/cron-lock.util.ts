import type { Redis } from 'ioredis';

/**
 * 0~maxSec 사이 랜덤 대기.
 *
 * 크론들이 전부 "정각"에 걸려 있어서 짝수시 00분처럼 여러 개가 같은 순간에 발화한다.
 * 실측상 겹치는 크론 수에 비례해 nest CPU 가 튀었다(인벤만 54~71% → 인벤+영상 갱신 80~121%).
 * 각 크론이 시작 전에 조금씩 다른 시간을 기다리면 같은 총량이 시간축에 흩어진다.
 *
 * 락과 같이 쓸 때는 지터가 락 TTL 보다 짧아야 한다 — runIfLockAcquired 참고.
 *
 * 테스트에서는 대기하지 않는다. 크론 메서드를 직접 호출하는 테스트가 지터만큼
 * 실제로 멈춰버려(기본 타임아웃 5초) 전부 실패하기 때문. 지터는 "스케줄러가 같은
 * 순간에 몰리는 것"을 막는 장치라, 직접 호출에는 의미도 없다.
 */
export function cronJitter(maxSec: number): Promise<void> {
  if (maxSec <= 0 || process.env.NODE_ENV === 'test') return Promise.resolve();
  const ms = Math.floor(Math.random() * maxSec * 1000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지터 폭 기본값. 락과 같이 쓰는 값은 락 TTL(보통 60초)보다 작아야 한다.
 *
 * - FREQUENT: 분 단위로 자주 도는 가벼운 작업(도커 통계, 라이브 갱신).
 *   샘플링 간격이 흐트러지지 않게 작게 잡는다.
 * - DAILY: 하루 1회/주 1회짜리. 같은 시각에 걸린 것들끼리만 떼어놓으면 된다.
 * - HEAVY: 수 분씩 도는 무거운 작업(인벤 크롤, 영상 갱신). 정각 클러스터에서
 *   확실히 빼내야 해서 분 단위로 크게 잡는다. 락 TTL 도 같이 키워야 한다.
 */
export const CRON_JITTER_FREQUENT_SEC = 30;
export const CRON_JITTER_DAILY_SEC = 45;
export const CRON_JITTER_HEAVY_SEC = 240;

/**
 * PM2 cluster 등 여러 프로세스에서 같은 @Cron이 동시에 등록·실행되는 것을 막는다.
 * 특정 워커 번호에 고정하지 않고 "그 틱에 먼저 락을 잡은 프로세스만 실행" 방식이라,
 * 항상 실행하던 워커가 죽어 있어도 살아있는 다른 워커가 자연스럽게 이어받는다(페일오버).
 *
 * 락 TTL은 fn 실행 시간과 무관 — 여러 프로세스의 크론 스케줄러가 같은 틱에
 * 몰리는 짧은 경쟁 구간만 막으면 되므로, fn이 오래 걸려도 락을 계속 쥐고 있을 필요 없다.
 *
 * jitterSec: 락을 잡기 전 0~jitterSec 랜덤 대기(크론 겹침 분산).
 */
export async function runIfLockAcquired(
  redis: Redis,
  jobName: string,
  fn: () => Promise<void> | void,
  ttlSec = 60,
  jitterSec = 0,
): Promise<void> {
  // ⚠️ 지터는 반드시 락 TTL 보다 짧아야 한다.
  //    워커들이 서로 다른 시간을 기다렸다 락을 잡으러 오는데, 지터가 TTL 보다 길면
  //    먼저 잡은 워커의 락이 이미 만료된 뒤에 늦은 워커가 도착해 새로 락을 잡고
  //    같은 틱을 한 번 더 실행한다. 호출부 실수를 막으려 여기서 잘라낸다.
  if (jitterSec > 0) {
    await cronJitter(Math.min(jitterSec, ttlSec - 1));
  }

  // ttlSec은 크론 주기보다 짧아야 함 — 주기(예: 1분)보다 길면 이전 틱의 락이
  // 다음 틱 시작 전까지 안 풀려 그 회차가 통째로 스킵되는 버그가 생긴다.
  const lockKey = `cron:lock:${jobName}`;
  const acquired = await redis.set(lockKey, '1', 'EX', ttlSec, 'NX');
  if (!acquired) return;
  await fn();
}

/**
 * 명시적 락 획득 — 크론뿐 아니라 "수동 API 트리거 + 크론"처럼 서로 다른 경로가
 * 같은 리소스를 공유할 때, 또는 작업 시간이 길어(수 분 이상) runIfLockAcquired의
 * "짧은 TTL로 경쟁 구간만 막는" 방식이 안 맞을 때 쓴다.
 *
 * 반드시 releaseLock으로 짝을 맞출 것(finally에서). 워커가 죽어 못 풀어도
 * ttlSec 후 자동 만료되어 영구히 막히지는 않는다(최종 일관성 — 완벽한 즉시
 * 일관성 대신, 최악의 경우에도 ttlSec 안에는 스스로 복구됨을 보장).
 */
export async function acquireLock(
  redis: Redis,
  jobName: string,
  ttlSec: number,
): Promise<boolean> {
  const lockKey = `cron:lock:${jobName}`;
  const acquired = await redis.set(lockKey, '1', 'EX', ttlSec, 'NX');
  return acquired === 'OK';
}

export async function releaseLock(
  redis: Redis,
  jobName: string,
): Promise<void> {
  await redis.del(`cron:lock:${jobName}`);
}
