// 뜨핫촤앗히얏 원정대 → loa_users DB 저장 스크립트
import mysql from 'mysql2/promise';

const API_KEY =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyIsImtpZCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyJ9.eyJpc3MiOiJodHRwczovL2x1ZHkuZ2FtZS5vbnN0b3ZlLmNvbSIsImF1ZCI6Imh0dHBzOi8vbHVkeS5nYW1lLm9uc3RvdmUuY29tL3Jlc291cmNlcyIsImNsaWVudF9pZCI6IjEwMDAwMDAwMDA1OTA4OTQifQ.MszkZKm0Qt5hQwBk_RQYfLzs3MiejvGOFOTKdQN-p87tu_aqOARKF0gNRU-fzsUVjznf33qC2u3Vu5ZLuMpJ5OqIsalJ962-VlpZ_GiL-E7wke88HCqzs0zSlBTgYqB5zsp_l-5f9lQg4-4DGGyHfwLiT5Sn_LMQZYdHFicpo58wtWG5dHrd7zznN6QyNVKgkCnD5Gct31ryS9ODUN6yjfANOzxawXMYPWOan2pCapvEPz-zuSY-CFctBzFWIiLzSFwspLPtP8_qLzrJbQNi5c-YNWmtAr8wSza7NRoC93jUw1YcMmvHrrESA0OUNiD9rHfnBp_3pgKCeOsuH7dupQ';
const headers = {
  Authorization: `bearer ${API_KEY}`,
  accept: 'application/json',
};
const BASE = 'https://developer-lostark.game.onstove.com';

const db = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3306,
  database: 'lost_ark',
  user: 'root',
  password: '1234',
});

// 1. siblings 조회
const sibRes = await fetch(
  `${BASE}/characters/${encodeURIComponent('뜨핫촤앗히얏')}/siblings`,
  { headers },
);
const siblings = await sibRes.json();
console.log(`\n원정대 캐릭터 수: ${siblings.length}명`);

// 2. theSix 계산 (아이템레벨 상위 6명)
const parseLevel = (s) => parseFloat((s || '0').replace(/,/g, ''));
const sorted = [...siblings].sort(
  (a, b) => parseLevel(b.ItemAvgLevel) - parseLevel(a.ItemAvgLevel),
);
const theSixSet = new Set(sorted.slice(0, 6).map((s) => s.CharacterName));
const topChar = sorted[0];
const expeditionKey = `${topChar.ServerName}:${topChar.CharacterName}`;
console.log(`expedition_key: ${expeditionKey}\n`);

// 3. loa_class 조회 (class_detail = 직업명, class_engraving = 각인명)
async function findClassIdx(charClassName, arkTitle) {
  // ArkPassive.Title(각인명)이 있으면 class_engraving으로 정확히 매칭
  if (arkTitle) {
    const [rows] = await db.execute(
      'SELECT idx FROM loa_class WHERE class_detail = ? AND class_engraving = ? LIMIT 1',
      [charClassName, arkTitle],
    );
    if (rows.length > 0) return rows[0].idx;
  }
  // fallback: class_detail(직업명)만으로 첫 번째 행
  const [rows] = await db.execute(
    'SELECT idx FROM loa_class WHERE class_detail = ? LIMIT 1',
    [charClassName],
  );
  return rows.length > 0 ? rows[0].idx : null;
}

// 4. 각 캐릭터 armory 조회 → DB upsert
for (const sib of siblings) {
  await new Promise((r) => setTimeout(r, 700));

  let arkTitle = null;
  try {
    const res = await fetch(
      `${BASE}/armories/characters/${encodeURIComponent(sib.CharacterName)}`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      arkTitle = data?.ArkPassive?.Title ?? null;
    }
  } catch {}

  const level = parseLevel(sib.ItemAvgLevel);
  const thesix = theSixSet.has(sib.CharacterName) ? 1 : 0;
  const classIdx = await findClassIdx(sib.CharacterClassName, arkTitle);

  await db.execute(
    `INSERT INTO loa_users (server, name, level, class, thesix, expedition_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       level = VALUES(level), class = VALUES(class),
       thesix = VALUES(thesix), expedition_key = VALUES(expedition_key)`,
    [sib.ServerName, sib.CharacterName, level, classIdx, thesix, expeditionKey],
  );

  console.log(
    `✓ ${sib.CharacterName.padEnd(20)} ${sib.CharacterClassName.padEnd(8)} Lv.${level} | 각인: ${arkTitle ?? '(비공개)'} | class_idx: ${classIdx ?? 'null'} | theSix: ${thesix ? 'Y' : '-'}`,
  );
}

await db.end();
console.log('\n✅ 완료');
