import { computeBalanceStatus } from './ai-diagnosis.service';

/**
 * 회귀 방지: 운영에서 실제로 관측된 케이스 —
 * CPU 크레딧 잔액이 287.57/288(관측 최대) 인데도 AI가 "크레딧 소진 위험이 있다"고
 * 오판했다(2026-07-31). 원인은 LLM이 잔액·소모량 두 숫자만 보고 위험 여부를
 * 직접 추론하게 둔 것 — 판단을 코드로 옮겨 결정론적으로 만들었다.
 */
describe('computeBalanceStatus', () => {
  it('데이터가 없으면 null', () => {
    expect(computeBalanceStatus(null, [], null)).toBeNull();
    expect(computeBalanceStatus(100, [100], null)).toBeNull();
  });

  it('관측 최대치에 가까우면 near_max (운영 실측 재현: 287.57/288)', () => {
    // GetMetricData는 최신순(내림차순) 배열을 반환한다.
    const series = [287.57, 287.8, 288, 288, 287.9];
    expect(computeBalanceStatus(287.57, series, 288)).toBe('near_max');
  });

  it('최대치와 거의 같아도 near_max', () => {
    expect(computeBalanceStatus(288, [288, 288], 288)).toBe('near_max');
  });

  it('24시간 동안 최대치의 15% 넘게 순감소했으면 declining', () => {
    // 최신 100, 24시간 전 250, 최대 250 → 150 감소 = 최대치의 60% > 15%
    const series = [100, 150, 200, 250];
    expect(computeBalanceStatus(100, series, 250)).toBe('declining');
  });

  it('감소했지만 15% 미만이고 최대치 근접도 아니면 stable', () => {
    // 최신 200(최대치의 80%, near_max 미만), 24시간 전 210, 최대 250
    // → 감소 10 = 최대치의 4% < 15%
    const series = [200, 205, 210];
    expect(computeBalanceStatus(200, series, 250)).toBe('stable');
  });

  it('데이터포인트가 1개뿐이면(oldest===latest) stable', () => {
    expect(computeBalanceStatus(150, [150], 250)).toBe('stable');
  });
});
