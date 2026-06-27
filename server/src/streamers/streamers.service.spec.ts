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
  dbVideos?: YoutubeVideoItem[];
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

  const db = {
    query: jest.fn().mockResolvedValue([[], []]),
    findRecentVideos: jest.fn().mockResolvedValue(options?.dbVideos ?? []),
  };

  const chzzk = {
    fetchLivesByCategory: jest.fn().mockResolvedValue([]),
    filterByViewerCount: jest.fn((items) => items),
  };

  const service = new StreamersService(redis as never, db as never, config, chzzk as never);
  return { service, redis, db, chzzk };
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
          viewCount: 1500,
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

  it('인기 영상 캐시가 없고 DB도 비어 있으면 빈 인기 목록을 반환한다', async () => {
    const { service } = createService();
    const fetchSpy = jest.spyOn(service as never, 'fetchFromYouTube');

    const result = await service.searchPopularVideos();

    expect(result).toEqual({
      items: [],
      nextOffset: null,
      hasMore: false,
      total: 0,
    });
    // 서빙 경로는 DB만 사용하며 YouTube API를 호출하지 않는다.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('인기 영상 캐시가 없으면 DB 누적분(최근 7일)에서 서빙한다', async () => {
    const dbVideos: YoutubeVideoItem[] = [
      {
        videoId: 'old7',
        title: '7일 전 영상',
        channelTitle: '채널',
        thumbnailUrl: 'https://example.com/old.jpg',
        publishedAt: '2026-06-03T00:00:00Z',
        duration: '12:00',
        viewCount: 5000,
      },
      {
        videoId: 'today1',
        title: '오늘 영상',
        channelTitle: '채널',
        thumbnailUrl: 'https://example.com/new.jpg',
        publishedAt: '2026-06-10T00:00:00Z',
        duration: '08:00',
        viewCount: 3000,
      },
    ];
    const { service, db, redis } = createService({ dbVideos });
    const fetchSpy = jest.spyOn(service as never, 'fetchFromYouTube');

    const result = await service.searchPopularVideos();

    expect(db.findRecentVideos).toHaveBeenCalledWith(7);
    expect(result.items).toEqual(dbVideos);
    expect(result.total).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    // DB 조회 결과를 Redis 읽기 캐시에 저장한다.
    expect(redis.set).toHaveBeenCalledWith(
      'youtube:popular:first',
      JSON.stringify({ items: dbVideos }),
      'EX',
      expect.any(Number),
    );
  });
});
