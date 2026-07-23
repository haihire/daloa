import { ConfigService } from '@nestjs/config';
import { SiteSuggestService } from './site-suggest.service';

// 토큰 보호 검증: NVIDIA_API_KEY가 없으면 실제 AI·네트워크 호출 없이 즉시 예외여야 함.
// (자동 실행이 없고 모달 버튼 클릭 시에만 호출되므로 별도 비활성 플래그는 두지 않음)
describe('SiteSuggestService', () => {
  const makeService = (cfg: Record<string, string>) => {
    const config = {
      get: (k: string) => cfg[k],
    } as unknown as ConfigService;
    return new SiteSuggestService(config);
  };

  const input = { url: 'https://example.kr', domain: 'example.kr' };

  it('NVIDIA_API_KEY 없으면 호출 없이 예외', async () => {
    const svc = makeService({});
    await expect(svc.suggest(input)).rejects.toThrow(/NVIDIA_API_KEY/);
  });
});
