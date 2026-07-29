import type { Redis } from 'ioredis';

/**
 * PM2 cluster 등 여러 프로세스에서 같은 @Cron이 동시에 등록·실행되는 것을 막는다.
 * 특정 워커 번호에 고정하지 않고 "그 틱에 먼저 락을 잡은 프로세스만 실행" 방식이라,
 * 항상 실행하던 워커가 죽어 있어도 살아있는 다른 워커가 자연스럽게 이어받는다(페일오버).
 *
 * 락 TTL은 fn 실행 시간과 무관 — 여러 프로세스의 크론 스케줄러가 같은 틱에
 * 몰리는 짧은 경쟁 구간만 막으면 되므로, fn이 오래 걸려도 락을 계속 쥐고 있을 필요 없다.
 */
export async function runIfLockAcquired(
  redis: Redis,
  jobName: string,
  fn: () => Promise<void> | void,
  ttlSec = 60,
): Promise<void> {
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

export async function releaseLock(redis: Redis, jobName: string): Promise<void> {
  await redis.del(`cron:lock:${jobName}`);
}
