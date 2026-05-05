import { Test, TestingModule } from '@nestjs/testing';
import { CharactersService, classifyStatBuild } from './characters.service';
import { DB_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';

// ────────────────────────────────────────────────────────────────────────────
// 순수 함수 classifyStatBuild 단위 테스트
// ────────────────────────────────────────────────────────────────────────────
describe('classifyStatBuild', () => {
  it('합산 300 미만 → 미설정', () => {
    expect(classifyStatBuild(100, 100, 50)).toBe('미설정');
  });

  it('합산 0 → 미설정', () => {
    expect(classifyStatBuild(0, 0, 0)).toBe('미설정');
  });

  it('세 스탯 모두 15% 이상 → 치특신', () => {
    expect(classifyStatBuild(800, 800, 800)).toBe('치특신');
  });

  it('치명 > 신속, 특화 15% 미만 → 치신', () => {
    expect(classifyStatBuild(1800, 150, 600)).toBe('치신');
  });

  it('신속 > 치명, 특화 15% 미만 → 신치', () => {
    expect(classifyStatBuild(600, 150, 1800)).toBe('신치');
  });

  it('치명 > 특화, 신속 15% 미만 → 치특', () => {
    expect(classifyStatBuild(1800, 600, 150)).toBe('치특');
  });

  it('특화 > 치명, 신속 15% 미만 → 특치', () => {
    expect(classifyStatBuild(600, 1800, 150)).toBe('특치');
  });

  it('신속 > 특화, 치명 15% 미만 → 신특', () => {
    expect(classifyStatBuild(150, 600, 1800)).toBe('신특');
  });

  it('특화 > 신속, 치명 15% 미만 → 특신', () => {
    expect(classifyStatBuild(150, 1800, 600)).toBe('특신');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CharactersService 서비스 단위 테스트 (DB 목 처리)
// ────────────────────────────────────────────────────────────────────────────
describe('CharactersService', () => {
  let service: CharactersService;
  let mockPool: { execute: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    mockPool = { execute: jest.fn() };
    mockRedis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: DB_POOL, useValue: mockPool },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CharactersService>(CharactersService);
  });

  it('DB 결과가 없으면 모든 탭의 totalCount가 0', async () => {
    mockPool.execute.mockResolvedValueOnce([[]]);
    const result = await service.findStatBuilds();
    expect(result.every((t) => t.totalCount === 0)).toBe(true);
  });

  it('항상 TAB_ORDER 7개 탭을 반환한다', async () => {
    mockPool.execute.mockResolvedValueOnce([[]]);
    const result = await service.findStatBuilds();
    expect(result).toHaveLength(7);
    expect(result.map((t) => t.statBuild)).toEqual([
      '치신',
      '신치',
      '치특',
      '특치',
      '신특',
      '특신',
      '치특신',
    ]);
  });

  it('치신 빌드 2명 → 치신 탭 totalCount 2', async () => {
    mockPool.execute.mockResolvedValueOnce([
      [
        {
          classDetail: '건슬링어',
          classEngraving: '피스메이커',
          statCrit: 1800,
          statSpec: 150,
          statSwift: 600,
          level: 1700,
        },
        {
          classDetail: '건슬링어',
          classEngraving: '피스메이커',
          statCrit: 1700,
          statSpec: 100,
          statSwift: 550,
          level: 1680,
        },
      ],
    ]);

    const result = await service.findStatBuilds();
    const chitab = result.find((t) => t.statBuild === '치신');
    expect(chitab?.totalCount).toBe(2);
  });

  it('미설정 빌드는 totalCount 집계에서 제외', async () => {
    mockPool.execute.mockResolvedValueOnce([
      [
        {
          classDetail: '워로드',
          classEngraving: '고통의 수호자',
          statCrit: 50,
          statSpec: 50,
          statSwift: 50,
          level: 1600,
        },
      ],
    ]);

    const result = await service.findStatBuilds();
    expect(result.every((t) => t.totalCount === 0)).toBe(true);
  });

  it('직업+각인이 다르면 별도 항목으로 집계', async () => {
    mockPool.execute.mockResolvedValueOnce([
      [
        {
          classDetail: '건슬링어',
          classEngraving: '피스메이커',
          statCrit: 1800,
          statSpec: 150,
          statSwift: 600,
          level: 1700,
        },
        {
          classDetail: '건슬링어',
          classEngraving: '시간여행자',
          statCrit: 150,
          statSpec: 600,
          statSwift: 1800,
          level: 1750,
        },
      ],
    ]);

    const result = await service.findStatBuilds();
    const chitab = result.find((t) => t.statBuild === '치신');
    const sinsptab = result.find((t) => t.statBuild === '신특');
    expect(chitab?.items).toHaveLength(1);
    expect(sinsptab?.items).toHaveLength(1);
  });
});
