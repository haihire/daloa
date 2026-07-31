import { findSecretLeaks } from './rag-secrets';

/**
 * RAG 문서 저장 직전 2차 방어(안전망) 검증.
 * 프롬프트 규칙만으로는 모델 실수를 막을 수 없어 코드로 강제하는 부분이라,
 * 여기가 뚫리면 시크릿이 문서에 박힌 뒤 임베딩까지 되어 챗봇이 노출할 수 있다.
 */
describe('findSecretLeaks', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('정상적인 운영 문서는 통과시킨다', () => {
    const doc = [
      '# 운영 스냅샷 2026-07-24~2026-07-31',
      '## 요약',
      'nest 컨테이너 평균 CPU 11.14%, 최대 748.77%로 짝수시에 스파이크가 관측됐다.',
      'postgres는 평균 2.46%로 안정적이며 내부 IP 172.19.0.2로 통신한다.',
    ].join('\n');
    expect(findSecretLeaks(doc)).toEqual([]);
  });

  it('env에 있는 실제 시크릿 값이 본문에 박히면 잡아낸다', () => {
    process.env.NVIDIA_API_KEY = 'super-secret-value-12345';
    const doc = '진단에 사용한 키는 super-secret-value-12345 입니다.';
    expect(findSecretLeaks(doc)).toContain('env:NVIDIA_API_KEY');
  });

  it('목록에 없어도 이름이 시크릿 형태인 env 값을 잡아낸다', () => {
    // 나중에 새 시크릿 env가 추가돼도 이 파일 수정을 잊어서 새는 것을 막는 장치
    process.env.SOME_NEW_SERVICE_TOKEN = 'brand-new-token-abcdefgh';
    expect(findSecretLeaks('토큰: brand-new-token-abcdefgh')).toContain(
      'env:SOME_NEW_SERVICE_TOKEN',
    );
  });

  it('env를 몰라도 형태만으로 시크릿을 잡아낸다', () => {
    expect(findSecretLeaks('key=nvapi-abcdefghijklmnop123')).toContain(
      'NVIDIA API 키 형식',
    );
    expect(findSecretLeaks('AKIAIOSFODNN7EXAMPLE 사용')).toContain(
      'AWS 액세스 키 형식',
    );
    expect(findSecretLeaks('-----BEGIN RSA PRIVATE KEY-----')).toContain(
      '개인키(PEM) 블록',
    );
    expect(
      findSecretLeaks('postgresql://lomoa:pw1234@10.0.0.1:5432/db'),
    ).toContain('postgres 접속 문자열');
  });

  it('공인 IP는 잡고 사설/루프백 IP는 통과시킨다', () => {
    // 실제 서버 IP 대신 문서용 예약 대역(RFC 5737 TEST-NET-3)을 쓴다 —
    // 테스트 픽스처로라도 운영 IP를 레포에 남기지 않기 위함.
    expect(findSecretLeaks('EC2 주소는 203.0.113.42 입니다')).toContain(
      '공인 IP 주소',
    );
    expect(findSecretLeaks('redis는 172.19.0.2, 로컬은 127.0.0.1')).toEqual([]);
  });

  it('버전 문자열을 IP로 오탐하지 않는다', () => {
    expect(findSecretLeaks('Nest 11.0.1 / Prisma 7.8.0 사용중')).toEqual([]);
  });

  it('너무 짧은 env 값은 우연한 일치를 피하려 검사하지 않는다', () => {
    process.env.SHORT_TOKEN = 'abc';
    expect(findSecretLeaks('abc 라는 단어가 들어간 문장')).toEqual([]);
  });

  it('적발 결과에 시크릿 값 자체를 담지 않는다(로그 유출 방지)', () => {
    process.env.NVIDIA_API_KEY = 'super-secret-value-12345';
    const hits = findSecretLeaks('키: super-secret-value-12345');
    expect(hits.join(' ')).not.toContain('super-secret-value-12345');
  });
});
