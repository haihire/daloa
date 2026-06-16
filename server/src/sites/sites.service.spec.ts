import { Test, TestingModule } from '@nestjs/testing';
import { KakaoService } from '../kakao/kakao.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SitesRepository } from './sites.repository';
import { SitesService } from './sites.service';

const CACHE_KEY = 'sites:all';
const CACHE_TTL = 600;

const DB_ROW = {
  seq: 1,
  name: 'Lost Ark official',
  href: 'https://lostark.game.onstove.com',
  category: 'official',
  description: 'official site',
};

const BROKEN_CANONICAL_ROW = {
  seq: 2,
  name: '?? ????',
  href: 'https://lostark.inven.co.kr/',
  category: 'community',
  description: '?? ???',
};

const BROKEN_UNKNOWN_ROW = {
  seq: 3,
  name: '?? ??',
  href: 'https://unknown-site.com/',
  category: null,
  description: '?? ??? ??',
};

describe('SitesService', () => {
  let service: SitesService;
  let mockSitesRepo: {
    findActive: jest.Mock;
    updateText: jest.Mock;
    findActiveForChecks: jest.Mock;
    updateCheckResult: jest.Mock;
  };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockKakao: Partial<KakaoService>;

  beforeEach(async () => {
    mockSitesRepo = {
      findActive: jest.fn(),
      updateText: jest.fn().mockResolvedValue(undefined),
      findActiveForChecks: jest.fn(),
      updateCheckResult: jest.fn().mockResolvedValue(undefined),
    };
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockKakao = { notifySiteChange: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SitesService,
        { provide: SitesRepository, useValue: mockSitesRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: KakaoService, useValue: mockKakao },
      ],
    }).compile();

    service = module.get<SitesService>(SitesService);
  });

  describe('findAll', () => {
    it('returns Redis cache without DB lookup', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify([DB_ROW]));

      const result = await service.findAll();

      expect(result).toEqual([DB_ROW]);
      expect(mockSitesRepo.findActive).not.toHaveBeenCalled();
    });

    it('invalidates broken Redis cache and reloads DB', async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify([DB_ROW, BROKEN_UNKNOWN_ROW]),
      );
      mockSitesRepo.findActive.mockResolvedValueOnce([DB_ROW]);

      const result = await service.findAll();

      expect(mockRedis.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(mockSitesRepo.findActive).toHaveBeenCalledTimes(1);
      expect(result).toEqual([DB_ROW]);
    });

    it('caches normal DB rows after a cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockSitesRepo.findActive.mockResolvedValueOnce([DB_ROW]);

      const result = await service.findAll();

      expect(result).toEqual([DB_ROW]);
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY,
        JSON.stringify([DB_ROW]),
        'EX',
        CACHE_TTL,
      );
    });

    it('repairs canonical broken rows before caching', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockSitesRepo.findActive.mockResolvedValueOnce([BROKEN_CANONICAL_ROW]);

      const result = await service.findAll();

      expect(mockSitesRepo.updateText).toHaveBeenCalledTimes(1);
      expect(result[0].name).toBe('Lost Ark Inven');
      expect(result[0].description).toBe('Lost Ark community');
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY,
        expect.stringContaining('Lost Ark Inven'),
        'EX',
        CACHE_TTL,
      );
    });

    it('skips Redis cache if unrepaired broken text remains', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockSitesRepo.findActive.mockResolvedValueOnce([BROKEN_UNKNOWN_ROW]);

      await service.findAll();

      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('caches an empty DB result', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockSitesRepo.findActive.mockResolvedValueOnce([]);

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
