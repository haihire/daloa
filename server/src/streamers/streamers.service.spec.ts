import { ConfigService } from '@nestjs/config';
import { StreamersService, type YoutubeVideoItem } from './streamers.service';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  ttl: jest.Mock;
};

function createService(options?: {
  localDisable?: string;
  cache?: { items: YoutubeVideoItem[]; nextPageToken: string | null };
  popularCache?: { items: YoutubeVideoItem[] };
}) {
  const redis: MockRedis = {
    get: jest.fn((key: string) => {
      if (key === 'youtube:videos:page:first') {
        return Promise.resolve(
          options?.cache ? JSON.stringify(options.cache) : null,
        );
      }
      if (key === 'youtube:popular:first') {
        return Promise.resolve(
          options?.popularCache ? JSON.stringify(options.popularCache) : null,
        );
      }
      if (key === 'youtube:quota_exceeded') return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    set: jest.fn(),
    ttl: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string | undefined> = {
        YOUTUBE_API_KEY: 'dummy-key',
        LOCAL_DISABLE_QUOTA_APIS: options?.localDisable,
      };
      return values[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;

  const service = new StreamersService(redis as never, config);
  return { service, redis };
}

describe('StreamersService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true면 시작 시 YouTube 갱신을 스킵한다', async () => {
    const { service } = createService({ localDisable: 'true' });
    const refreshSpy = jest.spyOn(service, 'refresh').mockResolvedValue();

    await service.onModuleInit();

    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true여도 캐시된 영상은 반환한다', async () => {
    const cached = {
      items: [
        {
          videoId: 'abc123',
          title: '테스트 영상',
          channelTitle: '테스트 채널',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          publishedAt: '2026-04-28T00:00:00Z',
          duration: '10:00',
          viewCount: 999,
        },
      ],
      nextPageToken: null,
    };
    const { service } = createService({
      localDisable: 'true',
      cache: cached,
    });
    const fetchSpy = jest.spyOn(service as never, 'fetchFromYouTube');

    const result = await service.searchVideos();

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true고 캐시가 없으면 빈 영상 결과를 반환한다', async () => {
    const { service } = createService({ localDisable: 'true' });
    const fetchSpy = jest.spyOn(service as never, 'fetchFromYouTube');

    const result = await service.searchVideos();

    expect(result).toEqual({ items: [], nextPageToken: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true고 인기 영상 캐시가 없으면 빈 인기 목록을 반환한다', async () => {
    const { service } = createService({ localDisable: 'true' });
    const fetchSpy = jest.spyOn(service as never, 'fetchFromYouTube');

    const result = await service.searchPopularVideos();

    expect(result).toEqual({
      items: [],
      nextOffset: null,
      hasMore: false,
      total: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
