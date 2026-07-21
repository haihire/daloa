import { BadRequestException, HttpStatus, HttpException } from '@nestjs/common';
import { FeedbackService, FEEDBACK_MAX_LENGTH } from './feedback.service';
import type { FeedbackRepository } from './feedback.repository';

function createService() {
  const repo = {
    create: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(1),
  };
  const service = new FeedbackService(repo as unknown as FeedbackRepository);
  return { service, repo };
}

describe('FeedbackService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('메시지를 앞뒤 공백 제거 후 저장하고 생성된 id를 반환한다', async () => {
    const { service, repo } = createService();
    repo.create.mockResolvedValue(42);

    const result = await service.submit({
      message: '  검색이 느려요  ',
      path: '/',
      deviceType: 'desktop',
      clientIp: '1.1.1.1',
    });

    expect(repo.create).toHaveBeenCalledWith({
      message: '검색이 느려요',
      path: '/',
      deviceType: 'desktop',
    });
    expect(result).toEqual({ ok: true, id: 42 });
  });

  it('공백뿐인 메시지는 BadRequest로 거부하고 저장하지 않는다', async () => {
    const { service, repo } = createService();

    await expect(
      service.submit({ message: '   ', clientIp: '1.1.1.1' }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it(`${FEEDBACK_MAX_LENGTH}자를 넘는 메시지는 BadRequest로 거부한다`, async () => {
    const { service, repo } = createService();

    await expect(
      service.submit({
        message: 'ㄱ'.repeat(FEEDBACK_MAX_LENGTH + 1),
        clientIp: '1.1.1.1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('path가 없으면 "/"로, deviceType이 없으면 "unknown"으로 저장한다', async () => {
    const { service, repo } = createService();

    await service.submit({ message: '의견', clientIp: '1.1.1.1' });

    expect(repo.create).toHaveBeenCalledWith({
      message: '의견',
      path: '/',
      deviceType: 'unknown',
    });
  });

  it('같은 IP가 10분 내 6번째로 제출하면 429를 던진다', async () => {
    const { service, repo } = createService();
    for (let i = 0; i < 5; i += 1) {
      await service.submit({ message: `의견${i}`, clientIp: '1.1.1.1' });
    }

    await expect(
      service.submit({ message: '여섯번째', clientIp: '1.1.1.1' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(repo.create).toHaveBeenCalledTimes(5);
  });

  it('한 IP가 한도에 걸려도 다른 IP는 정상 접수된다', async () => {
    const { service, repo } = createService();
    for (let i = 0; i < 5; i += 1) {
      await service.submit({ message: `의견${i}`, clientIp: '1.1.1.1' });
    }

    await expect(
      service.submit({ message: '다른 사람', clientIp: '2.2.2.2' }),
    ).resolves.toEqual({ ok: true, id: 1 });
    expect(repo.create).toHaveBeenCalledTimes(6);
  });

  it('10분 윈도우가 지나면 같은 IP도 다시 제출할 수 있다', async () => {
    const { service, repo } = createService();
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now');

    clock.mockReturnValue(start);
    for (let i = 0; i < 5; i += 1) {
      await service.submit({ message: `의견${i}`, clientIp: '1.1.1.1' });
    }

    clock.mockReturnValue(start + 10 * 60_000 + 1);
    await expect(
      service.submit({ message: '윈도우 이후', clientIp: '1.1.1.1' }),
    ).resolves.toEqual({ ok: true, id: 1 });
    expect(repo.create).toHaveBeenCalledTimes(6);
  });

  it('전체 요청이 1분 60건을 넘으면 IP가 달라도 429를 던진다', async () => {
    const { service } = createService();
    for (let i = 0; i < 60; i += 1) {
      await service.submit({ message: `의견${i}`, clientIp: `10.0.0.${i}` });
    }

    await expect(
      service.submit({ message: '초과분', clientIp: '10.0.1.1' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('레이트리밋 초과는 HttpException으로 던져 429 응답이 되게 한다', async () => {
    const { service } = createService();
    for (let i = 0; i < 5; i += 1) {
      await service.submit({ message: `의견${i}`, clientIp: '3.3.3.3' });
    }

    await expect(
      service.submit({ message: '초과', clientIp: '3.3.3.3' }),
    ).rejects.toThrow(HttpException);
  });
});
