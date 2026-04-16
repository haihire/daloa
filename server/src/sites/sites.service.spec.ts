import { Test, TestingModule } from '@nestjs/testing';
import { SitesService } from './sites.service';
import { DB_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import { KakaoService } from '../kakao/kakao.service';

const CACHE_KEY = 'sites:all';
const CACHE_TTL = 600;

const DB_ROW = {
  seq: 1,
  name: '로스트아크 공홈',
  href: 'https://lostark.game.onstove.com',
  category: '공식',
  description: '로스트아크 공식 홈페이지',
  icon: null,
};

describe('SitesService', () => {
  let service: SitesService;
  let mockPool: { execute: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockKakao: Partial<KakaoService>;

  beforeEach(async () => {
    mockPool = { execute: jest.fn() };
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockKakao = { notifySiteChange: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SitesService,
        { provide: DB_POOL, useValue: mockPool },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: KakaoService, useValue: mockKakao },
      ],
    }).compile();

    service = module.get<SitesService>(SitesService);
  });

  describe('findAll', () => {
    it('Redis 캐시 히트 시 DB를 조회하지 않는다', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify([DB_ROW]));

      const result = await service.findAll();

      expect(result).toEqual([DB_ROW]);
      expect(mockPool.execute).not.toHaveBeenCalled();
    });

    it('Redis 캐시 미스 시 DB를 조회하고 캐시에 저장한다', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.execute.mockResolvedValueOnce([[DB_ROW]]);

      const result = await service.findAll();

      expect(result).toEqual([DB_ROW]);
      expect(mockPool.execute).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY,
        JSON.stringify([DB_ROW]),
        'EX',
        CACHE_TTL,
      );
    });

    it('Redis 캐시 미스 시 DB가 빈 배열을 반환하면 빈 배열로 캐시 저장', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.execute.mockResolvedValueOnce([[]]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY,
        '[]',
        'EX',
        CACHE_TTL,
      );
    });
  });
});
