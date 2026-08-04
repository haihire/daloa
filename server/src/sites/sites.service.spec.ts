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

describe('SitesService', () => {
  let service: SitesService;
  let mockSitesRepo: {
    findActive: jest.Mock;
    findActiveForChecks: jest.Mock;
    updateCheckResult: jest.Mock;
  };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockKakao: Partial<KakaoService>;

  beforeEach(async () => {
    mockSitesRepo = {
      findActive: jest.fn(),
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

    it('caches DB rows after a cache miss', async () => {
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
