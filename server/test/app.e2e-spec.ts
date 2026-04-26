import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E 테스트 — 실제 DB·Redis 연결이 필요합니다.
 * 로컬에서 `docker-compose up -d` 후 실행하세요.
 * CI 환경에서는 서비스 컨테이너를 같이 기동한 뒤 실행합니다.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/sites → 200 + 배열 반환', () => {
    return request(app.getHttpServer())
      .get('/api/sites')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /api/characters/stat-builds → 200 + 7개 탭', () => {
    return request(app.getHttpServer())
      .get('/api/characters/stat-builds')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(7);
      });
  });

  it('존재하지 않는 경로 → 404', () => {
    return request(app.getHttpServer()).get('/api/not-found').expect(404);
  });
});
