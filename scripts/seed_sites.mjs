import mysql from 'mysql2/promise';

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '1234',
    database: 'lost_ark',
  });

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS loa_sites (
      seq INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      href VARCHAR(500) NOT NULL,
      category VARCHAR(50),
      description TEXT,
      icon VARCHAR(500),
      is_active TINYINT(1) DEFAULT 1,
      last_title VARCHAR(500),
      last_status INT,
      checked_at DATETIME,
      UNIQUE KEY uq_href (href)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const sites = [
    [
      '로펙',
      'https://lopec.kr/',
      '스펙 수치화',
      '캐릭터 스펙을 수치화해 보여주는 검색 사이트.',
      'https://www.google.com/s2/favicons?domain=lopec.kr&sz=32',
    ],
    [
      '아이스펭',
      'https://loa.icepeng.com/',
      '재련·손익 툴',
      '재련, 상급재련, 돌파고, 더보기 손익 등 각종 툴 제공.',
      'https://www.google.com/s2/favicons?domain=loa.icepeng.com&sz=32',
    ],
    [
      '로스트 빌드',
      'https://lostbuilds.com/',
      '데미지 시뮬',
      '데미지 시뮬레이터 사이트.',
      'https://www.google.com/s2/favicons?domain=lostbuilds.com&sz=32',
    ],
    [
      '유각 시세 조회',
      'https://loa-shop.pages.dev/',
      '시세 조회',
      '실시간 유각 시세 조회 사이트.',
      'https://loa-shop.pages.dev/icon.png',
    ],
    [
      'LoaGap',
      'https://loagap.com/',
      '통합 툴',
      '컨텐츠 효율, 유각·보석·악세 시세 확인 등 각종 툴 제공.',
      'https://www.google.com/s2/favicons?domain=loagap.com&sz=32',
    ],
    [
      '로스트 골드',
      'https://lostgld.com/',
      '생활 효율',
      '생활도구 효율 및 융화재료 효율 계산기 지원 사이트.',
      'https://www.google.com/s2/favicons?domain=lostgld.com&sz=32',
    ],
    [
      'KLoa',
      'https://kloa.gg/',
      '공식 통디',
      '로스트아크 통디 공식 사이트. 떠상 알람 지원 및 캐릭터 검색 기능 지원.',
      'https://www.google.com/s2/favicons?domain=kloa.gg&sz=32',
    ],
    [
      '로아와',
      'https://loawa.com/',
      '캐릭터 검색',
      '캐릭터 검색 기능 및 캐릭터 통계 조회 사이트.',
      'https://www.google.com/s2/favicons?domain=loawa.com&sz=32',
    ],
    [
      '로아베스팅',
      'https://www.loavesting.com/',
      '재련 계산',
      '재련 비용 계산기 등 툴 제공 사이트.',
      'https://www.google.com/s2/favicons?domain=loavesting.com&sz=32',
    ],
    [
      'Loatto',
      'https://loatto.kr/',
      '통합 툴',
      '돌파고, 젬파고, 지옥보상 효율 등 각종 툴 제공.',
      'https://www.google.com/s2/favicons?domain=loatto.kr&sz=32',
    ],
    [
      '로아차트',
      'https://loachart.com/',
      '제작·경매',
      '제작/마리샵/더보기 효율, 레이드 경매 계산기 지원.',
      'https://www.google.com/s2/favicons?domain=loachart.com&sz=32',
    ],
    [
      '로아업',
      'https://loaup.com',
      '스펙업 순서',
      '스펙업 순서를 가이드해 주는 사이트.',
      'https://www.google.com/s2/favicons?domain=loaup.com&sz=32',
    ],
    [
      '로아투두',
      'https://app.loatodo.com/todo',
      '숙제 관리',
      '숙제 스케줄 관리 사이트.',
      'https://www.google.com/s2/favicons?domain=app.loatodo.com&sz=32',
    ],
  ];

  for (const s of sites) {
    await conn.execute(
      'INSERT IGNORE INTO loa_sites (name,href,category,description,icon) VALUES (?,?,?,?,?)',
      s,
    );
  }

  const [r] = await conn.execute('SELECT COUNT(*) as cnt FROM loa_sites');
  console.log('loa_sites 행 수:', r[0].cnt);
  await conn.end();
})();
