import { ConfigService } from '@nestjs/config';
import { ClassSummaryService } from './class-summary.service';

type MockPool = {
  execute: jest.Mock;
};

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
};

function createService(localDisable = 'true') {
  const pool: MockPool = {
    execute: jest.fn(),
  };

  const redis: MockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        GEMINI_API_KEY: 'dummy-key',
        LOCAL_DISABLE_QUOTA_APIS: localDisable,
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const service = new ClassSummaryService(
    pool as never,
    redis as never,
    config,
  );
  return { service, pool };
}

describe('ClassSummaryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true면 초기 직업 크롤링을 시작하지 않는다', async () => {
    const { service, pool } = createService();
    const runAllSpy = jest.spyOn(service, 'runAll').mockResolvedValue();

    await service.onModuleInit();

    expect(pool.execute).not.toHaveBeenCalled();
    expect(runAllSpy).not.toHaveBeenCalled();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true면 스케줄 직업 크롤링을 시작하지 않는다', async () => {
    const { service } = createService();
    const runAllSpy = jest.spyOn(service, 'runAll').mockResolvedValue();

    await service.scheduledRun();

    expect(runAllSpy).not.toHaveBeenCalled();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true면 수동 runAll도 내부 처리 없이 종료한다', async () => {
    const { service } = createService();
    const processSpy = jest.spyOn(service as never, 'processClass');

    await service.runAll();

    expect(processSpy).not.toHaveBeenCalled();
  });
});
