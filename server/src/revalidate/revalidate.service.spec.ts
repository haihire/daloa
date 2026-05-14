import { Test, TestingModule } from '@nestjs/testing';
import { RevalidateService } from './revalidate.service';

describe('RevalidateService', () => {
  let service: RevalidateService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RevalidateService],
    }).compile();

    service = module.get<RevalidateService>(RevalidateService);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    delete process.env.NEXT_REVALIDATE_URL;
    delete process.env.NEXT_REVALIDATE_SECRET;
  });

  it('환경변수 미설정 시 fetch를 호출하지 않는다', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    await service.onApplicationBootstrap();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('환경변수 설정 시 올바른 URL과 Authorization 헤더로 POST 요청한다', async () => {
    process.env.NEXT_REVALIDATE_URL = 'https://www.daloa.kr/api/revalidate';
    process.env.NEXT_REVALIDATE_SECRET = 'test-secret';

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    await service.onApplicationBootstrap();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://www.daloa.kr/api/revalidate',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      },
    );
  });

  it('서버가 비성공 응답을 반환해도 예외를 던지지 않는다', async () => {
    process.env.NEXT_REVALIDATE_URL = 'https://www.daloa.kr/api/revalidate';
    process.env.NEXT_REVALIDATE_SECRET = 'test-secret';

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });

  it('네트워크 오류가 발생해도 예외를 던지지 않는다', async () => {
    process.env.NEXT_REVALIDATE_URL = 'https://www.daloa.kr/api/revalidate';
    process.env.NEXT_REVALIDATE_SECRET = 'test-secret';

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Network error'));

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });
});
