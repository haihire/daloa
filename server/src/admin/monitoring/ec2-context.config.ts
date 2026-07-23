/**
 * AI 컨테이너 진단에 주입할 정적 컨텍스트.
 * - 가격/사양은 코드에 박아두고 수동 관리한다(소규모라 자동 동기화 가치 < 관리 비용).
 * - 앱 제약/트래픽 특성은 운영자가 직접 수정해 AI 판단의 근거로 쓴다.
 */

export interface InstanceSpec {
  vcpu: number;
  ramGb: number;
  /** ap-northeast-2(서울) 리눅스 온디맨드 시간당 USD (대략값, 수동 갱신). */
  usdPerHour: number;
  /** 버스트/아키텍처 등 AI가 알아야 할 주의점. */
  note?: string;
}

/**
 * 인스턴스 타입별 사양·가격 (ap-northeast-2 / Linux / On-Demand).
 * ⚠️ 정확한 금액은 변동되므로 참고용. 비용 비교의 기준점으로만 사용.
 * 가격 기준: 2026 상반기 서울 리전 대략값.
 */
export const INSTANCE_PRICING: Record<string, InstanceSpec> = {
  't3.nano': { vcpu: 2, ramGb: 0.5, usdPerHour: 0.0065 },
  't3.micro': { vcpu: 2, ramGb: 1, usdPerHour: 0.013 },
  't3.small': { vcpu: 2, ramGb: 2, usdPerHour: 0.026 },
  't3.medium': { vcpu: 2, ramGb: 4, usdPerHour: 0.052 },
  't4g.small': {
    vcpu: 2,
    ramGb: 2,
    usdPerHour: 0.0208,
    note: 'ARM(Graviton). x86 대비 ~20% 저렴하나 컨테이너 이미지를 arm64로 재빌드해야 함',
  },
  't4g.medium': {
    vcpu: 2,
    ramGb: 4,
    usdPerHour: 0.0416,
    note: 'ARM(Graviton). arm64 재빌드 필요',
  },
};

/** T3/T4g 버스트 동작 설명 — AI가 CPU 스파이크의 비용 함의를 이해하도록. */
export const BURST_NOTE =
  't3/t4g는 버스트 인스턴스. baseline(t3.small ≈ vCPU당 20%)을 넘는 CPU 사용은 ' +
  'CPU 크레딧을 소모하며, unlimited 모드에서는 크레딧 소진 시 시간당 추가 과금(vCPU-시간당 약 $0.05)이 발생한다. ' +
  '특정 시간대 지속적인 CPU 스파이크는 인스턴스를 키우는 대신 작업 분산/스케줄 조정으로 크레딧 과금을 줄일 수 있다.';

/** 컨테이너별 역할·최소 사양 메모 (운영자 직접 편집). */
export const APP_CONSTRAINTS: Record<string, string> = {
  nest: 'Node(NestJS) 백엔드 API. 상시 구동. 메인 워크로드.',
  nginx: '리버스 프록시 + TLS 종단. 경량.',
  redis: '캐시(사이트 목록/유튜브 등). 경량.',
  postgres: '주 데이터베이스. 상시 구동, 데이터 유실 불가.',
};

/** 서비스 트래픽 특성 (운영자 직접 편집). */
export const TRAFFIC_PROFILE =
  '저트래픽 로스트아크 정보 사이트. 프론트엔드는 Vercel(외부 호스팅)이라 ' +
  'EC2에는 API 서버·DB·캐시만 구동된다. 사용자 접속은 저녁 시간대에 몰리는 편.';

/** EC2 정보를 못 구했을 때(로컬 도커 등) 표시용 기본 리전. */
export const DEFAULT_REGION = 'ap-northeast-2';
