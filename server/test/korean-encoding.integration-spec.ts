/**
 * 한글 인코딩 통합 테스트
 *
 * 목적: loa_sites 테이블에 한글 name/description을 INSERT 후 SELECT 했을 때
 *       원본 문자열과 정확히 일치하는지 검증한다.
 *       CI(GitHub Actions)에서 MariaDB 서비스 컨테이너를 사용해 실행된다.
 *
 * 환경변수 (Actions에서 자동 주입):
 *   DB_HOST     - 기본값: 127.0.0.1
 *   DB_PORT     - 기본값: 3306
 *   DB_USER     - 기본값: testuser
 *   DB_PASSWORD - 기본값: testpass
 *   DB_NAME     - 기본값: testdb
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'testuser',
  password: process.env.DB_PASSWORD ?? 'testpass',
  database: process.env.DB_NAME ?? 'testdb',
  charset: 'utf8mb4',
};

const TEST_SITES = [
  {
    name: '로스트아크 인벤',
    href: 'https://lostark.inven.co.kr/',
    description: '로아 커뮤니티',
  },
  {
    name: 'LOALAB',
    href: 'https://lo4.app/',
    description: '재련·경매·치명타 계산기, 음돌 계산기 등 통합 툴',
  },
  {
    name: '사사게 검색기',
    href: 'https://sasagefind.com/',
    description: '범죄자 데이터베이스',
  },
  {
    name: '로스트아크 공식',
    href: 'https://lostark.game.onstove.com/',
    description: '공식 공지·패치노트 제공',
  },
];

describe('한글 인코딩 통합 테스트 (loa_sites)', () => {
  let connection: mysql.Connection;

  beforeAll(async () => {
    connection = await mysql.createConnection(DB_CONFIG);

    // 테스트용 임시 테이블 생성 (실제 loa_sites 스키마와 동일)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS loa_sites_enc_test (
        seq        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(100) NOT NULL,
        href       VARCHAR(500) NOT NULL,
        description VARCHAR(200) NULL,
        is_active  TINYINT     NOT NULL DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  });

  afterAll(async () => {
    await connection.execute('DROP TABLE IF EXISTS loa_sites_enc_test');
    await connection.end();
  });

  beforeEach(async () => {
    await connection.execute('DELETE FROM loa_sites_enc_test');
  });

  it('단일 한글 행 INSERT 후 SELECT 시 name이 원본과 일치한다', async () => {
    const site = TEST_SITES[0];
    await connection.execute(
      'INSERT INTO loa_sites_enc_test (name, href, description) VALUES (?, ?, ?)',
      [site.name, site.href, site.description],
    );

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT name, description FROM loa_sites_enc_test WHERE href = ?',
      [site.href],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(site.name);
    expect(rows[0].description).toBe(site.description);
  });

  it('여러 한글 행 일괄 INSERT 후 각 행의 name/description이 원본과 일치한다', async () => {
    for (const site of TEST_SITES) {
      await connection.execute(
        'INSERT INTO loa_sites_enc_test (name, href, description) VALUES (?, ?, ?)',
        [site.name, site.href, site.description],
      );
    }

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT name, href, description FROM loa_sites_enc_test ORDER BY seq',
    );

    expect(rows).toHaveLength(TEST_SITES.length);

    for (let i = 0; i < TEST_SITES.length; i++) {
      expect(rows[i].name).toBe(TEST_SITES[i].name);
      expect(rows[i].description).toBe(TEST_SITES[i].description);
    }
  });

  it('중간점(·) 특수문자가 포함된 description이 깨지지 않는다', async () => {
    const site = TEST_SITES[1]; // '재련·경매·치명타 계산기, 음돌 계산기 등 통합 툴'
    await connection.execute(
      'INSERT INTO loa_sites_enc_test (name, href, description) VALUES (?, ?, ?)',
      [site.name, site.href, site.description],
    );

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT description FROM loa_sites_enc_test WHERE href = ?',
      [site.href],
    );

    expect(rows[0].description).toBe(site.description);
    expect(rows[0].description).toContain('·');
  });

  it('SELECT 결과에 깨진 문자(연속 물음표 ??)가 없다', async () => {
    for (const site of TEST_SITES) {
      await connection.execute(
        'INSERT INTO loa_sites_enc_test (name, href, description) VALUES (?, ?, ?)',
        [site.name, site.href, site.description],
      );
    }

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT name, description FROM loa_sites_enc_test',
    );

    for (const row of rows) {
      expect(row.name).not.toMatch(/\?{2,}/);
      expect(row.description ?? '').not.toMatch(/\?{2,}/);
    }
  });
});
