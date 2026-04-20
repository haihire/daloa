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

// SITE_TEXT_CANONICAL에 등록된 사이트 (자동 복구 가능)
const BROKEN_CANONICAL_ROW = {
  seq: 2,
  name: '?? ????',
  href: 'https://lostark.inven.co.kr/',
  category: '커뮤니티',
  description: '?? ???',
  icon: null,
};

// SITE_TEXT_CANONICAL에 없는 사이트 (자동 복구 불가)
const BROKEN_UNKNOWN_ROW = {
  seq: 3,
  name: '?? ??',
  href: 'https://unknown-site.com/',
  category: null,
  description: '?? ??? ??',
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

    it('Redis 캐시에 깨진 텍스트가 있으면 캐시를 무효화하고 DB를 재조회한다', async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify([DB_ROW, BROKEN_UNKNOWN_ROW]),
      );
      mockPool.execute.mockResolvedValueOnce([[DB_ROW]]);

      const result = await service.findAll();

      expect(mockRedis.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(mockPool.execute).toHaveBeenCalledTimes(1);
      expect(result).toEqual([DB_ROW]);
    });

    it('Redis 캐시 무효화 후 DB에서 정상 데이터를 받으면 캐시에 저장한다', async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify([BROKEN_CANONICAL_ROW]),
      );
      mockPool.execute.mockResolvedValueOnce([[DB_ROW]]);

      await service.findAll();

      expect(mockRedis.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY,
        JSON.stringify([DB_ROW]),
        'EX',
        CACHE_TTL,
      );
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

    it('DB에서 SITE_TEXT_CANONICAL 등록 사이트의 깨진 텍스트를 복구한 뒤 캐시에 저장한다', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.execute
        .mockResolvedValueOnce([[BROKEN_CANONICAL_ROW]]) // SELECT
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

      const result = await service.findAll();

      expect(result[0].name).toBe('로스트아크 인벤');
      expect(result[0].description).toBe('로아 커뮤니티');
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY,
        expect.stringContaining('로스트아크 인벤'),
        'EX',
        CACHE_TTL,
      );
    });

    it('DB에서 미등록 사이트에 깨진 텍스트가 있으면 복구 없이 캐시 저장을 생략한다', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.execute.mockResolvedValueOnce([[BROKEN_UNKNOWN_ROW]]);

      await service.findAll();

      expect(mockRedis.set).not.toHaveBeenCalled();
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
