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
  del: jest.Mock;
};

function createService(options?: {
  localDisable?: boolean;
  cache?: { items: YoutubeVideoItem[]; nextPageToken: string | null };
}) {
  const redis: MockRedis = {
    get: jest.fn((key: string) => {
      if (key === 'youtube:videos:page:first') {
        return Promise.resolve(
          options?.cache ? JSON.stringify(options.cache) : null,
        );
      }
      if (key === 'youtube:quota_exceeded') return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    set: jest.fn(),
    ttl: jest.fn(),
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

  const service = new YoutubeVideosService(
    redis as never,
    streamingRedis,
    youtubeApi,
  );
  return { service, redis, streamingRedis, youtubeApi };
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
});
