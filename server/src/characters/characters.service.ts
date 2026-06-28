// 장비 스탯 수치(치명/특화/신속) 기반 빌드 분류 유틸.
// (홈 "특성 빌드 분포" 기능 제거 후에도 users 동기화에서 사용하므로 유지)
// 전체 합산 대비 비율 15% 이상이어야 해당 스탯을 "투자됨"으로 인정
// ex) 치명 1800 + 신속 600 + 특화 150 → 특화 비율 6.1% < 15% → 치신 / 합산 < 300이면 미설정
// ex) 치명 800 + 신속 800 + 특화 800 → 각 33% ≥ 15% → 치특신
const STAT_RATIO_THRESHOLD = 0.15;

export function classifyStatBuild(
  crit: number,
  spec: number,
  swift: number,
): string {
  const total = crit + spec + swift;
  if (total < 300) return '미설정';

  const hasCrit = crit / total >= STAT_RATIO_THRESHOLD;
  const hasSpec = spec / total >= STAT_RATIO_THRESHOLD;
  const hasSwift = swift / total >= STAT_RATIO_THRESHOLD;

  const count = [hasCrit, hasSpec, hasSwift].filter(Boolean).length;
  if (count === 0) return '미설정';
  if (count === 3) return '치특신';

  const pairMap: Record<string, string> = {
    'crit-swift': '치신',
    'swift-crit': '신치',
    'crit-spec': '치특',
    'spec-crit': '특치',
    'swift-spec': '신특',
    'spec-swift': '특신',
  };

  // 활성 스탯 2개: 수치 내림차순으로 키 조합
  const active = [
    { key: 'crit', val: crit, has: hasCrit },
    { key: 'spec', val: spec, has: hasSpec },
    { key: 'swift', val: swift, has: hasSwift },
  ]
    .filter((s) => s.has)
    .sort((a, b) => b.val - a.val);

  if (active.length >= 2) {
    return pairMap[`${active[0].key}-${active[1].key}`] ?? '미설정';
  }

  // 비율 기준 활성 스탯이 1개뿐 → 수치 2위 스탯과 페어
  const all = [
    { key: 'crit', val: crit },
    { key: 'spec', val: spec },
    { key: 'swift', val: swift },
  ].sort((a, b) => b.val - a.val);
  return pairMap[`${all[0].key}-${all[1].key}`] ?? '미설정';
}
