import {
  YoutubeVideosService,
  type YoutubeVideoItem,
} from './youtube-videos.service';
import type { StreamingRedisService } from './streaming-redis.service';
import type { YoutubeApiService } from './youtube-api.service';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  ttl: jest.Mock;
  smembers: jest.Mock;
  sadd: jest.Mock;
  srem: jest.Mock;
  del: jest.Mock;
};

function createService(options?: {
  localDisable?: boolean;
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
    smembers: jest.fn().mockResolvedValue([]),
    sadd: jest.fn(),
    srem: jest.fn(),
    del: jest.fn(),
  };

  // 테스트에서 YOUTUBE_REDIS_HOST 를 설정하지 않는 원래 시나리오와 동일하게,
  // streamingRedis.client === redis(기본 REDIS_CLIENT) 로 둔다.
  const streamingRedis = {
    client: redis,
    readOnly: false,
  } as unknown as StreamingRedisService;

  const youtubeApi = {
    current: {} as never,
    keyCount: 1,
    currentIndex: 0,
    rotateKey: jest.fn(() => 0),
    quotaApisDisabled: options?.localDisable ?? false,
  } as unknown as YoutubeApiService;

  const db = {
    query: jest.fn().mockResolvedValue([[], []]),
    findRecentVideos: jest.fn().mockResolvedValue(options?.dbVideos ?? []),
  };

  const service = new YoutubeVideosService(
    redis as never,
    db as never,
    streamingRedis,
    youtubeApi,
  );
  return { service, redis, db, streamingRedis, youtubeApi };
}

describe('YoutubeVideosService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true면 시작 시 YouTube 갱신을 스킵한다', async () => {
    const { service } = createService({ localDisable: true });
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
      localDisable: true,
      cache: cached,
    });
    const fetchSpy = jest.spyOn(service as never, 'fetchFromYouTube');

    const result = await service.searchVideos();

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('LOCAL_DISABLE_QUOTA_APIS=true고 캐시가 없으면 빈 영상 결과를 반환한다', async () => {
    const { service } = createService({ localDisable: true });
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
