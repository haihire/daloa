# 諛고룷 諛⑸쾿

---

## 1. ?쒕쾭 (EC2 諛고룷)

### ?ъ쟾 議곌굔

- AWS EC2 ?몄뒪?댁뒪 (Ubuntu)
- Docker + Docker Compose ?ㅼ튂??
- SSH ???뚯씪: `daloa-key.pem` (寃쎈줈: `C:\Users\tjdtn\Desktop\?닿??앷컖?섎뒗誘몃옒\媛쒕컻\濡쒖븘?ъ씠??紐⑥쓬\daloa-key.pem`)
- EC2 IP: `3.39.239.9`
- Let's Encrypt SSL ?몄쬆??諛쒓툒 ?꾨즺 (`api.daloa.kr`)

### 1-1. SSH ?묒냽

```powershell
ssh -i "C:\\Users\\tjdtn\\Desktop\\내가생각하는미래\\개발\\로아사이트 모음\\daloa-key.pem" ubuntu@3.39.239.9
```

### 1-2. 肄붾뱶 ?낅뜲?댄듃 + 鍮뚮뱶 + ?ъ떆??

```bash
# EC2 ?쒕쾭 ?덉뿉???ㅽ뻾
cd daloa

# 理쒖떊 肄붾뱶 媛?몄삤湲?
git pull

# NestJS 鍮뚮뱶 (EC2?먯꽌 吏곸젒 ??Docker ??硫붾え由??덉빟)
cd server
npm run build

# Docker 而⑦뀒?대꼫 ?щ퉴??+ ?ъ떆??(--build ?꾩닔 ???놁쑝硫??댁쟾 ?대?吏 ?ъ궗??
cd ..
docker compose up -d --build nest
```

### 1-3. ?먯빱留⑤뱶 諛고룷 (濡쒖뺄?먯꽌)

```powershell
ssh -i "C:\\Users\\tjdtn\\Desktop\\내가생각하는미래\\개발\\로아사이트 모음\\daloa-key.pem" -o StrictHostKeyChecking=no ubuntu@3.39.239.9 "cd daloa && git pull && cd server && npm run build 2>&1 | tail -3 && cd .. && docker compose up -d --build nest 2>&1 | tail -3"
```

### 1-4. ?꾩껜 ?쒕퉬???ъ떆??(MySQL, Redis, Nginx ?ы븿)

```bash
# EC2 ?덉뿉??(mysql, nginx??production profile)
cd daloa
docker compose --profile production down
docker compose --profile production up -d
```

### 1-6. EC2 ?섍꼍蹂??.env) ?섏젙

> ?좑툘 Docker??`/home/ubuntu/daloa/.env`瑜??쎌쓬. `server/.env`??濡쒖뺄 媛쒕컻?⑹씠硫?EC2 Docker???쎌? ?딅뒗??

```bash
# EC2 ?묒냽 ??吏곸젒 ?몄쭛
nano /home/ubuntu/daloa/.env

# ?섏젙 ??nest 而⑦뀒?대꼫 ?ъ떆??(--build ?꾩닔)
cd daloa && docker compose up -d --build nest
```

濡쒖뺄?먯꽌 SCP濡???뼱??寃쎌슦 **諛섎뱶??`/home/ubuntu/daloa/.env`** 寃쎈줈濡??꾩넚:

```powershell
# ?? EC2 ?꾩슜 ??鍮꾨?踰덊샇媛 ?ы븿??EC2 .env瑜?濡쒖뺄?먯꽌 ??뼱?곗? ?딅룄濡?二쇱쓽
scp -i "C:\\Users\\tjdtn\\Desktop\\내가생각하는미래\\개발\\로아사이트 모음\\daloa-key.pem" .env ubuntu@3.39.239.9:/home/ubuntu/daloa/.env
```

### 1-5. 濡쒓렇 ?뺤씤

```bash
# NestJS 而⑦뀒?대꼫 濡쒓렇
docker logs daloa-nest --tail 50

# Nginx 濡쒓렇
docker logs daloa-nginx --tail 50

# Redis 濡쒓렇
docker logs daloa-redis --tail 50
```

---

## 2. ?대씪?댁뼵??(Vercel 諛고룷)

### ?ъ쟾 議곌굔

- Vercel 怨꾩젙??GitHub 由ы룷吏?좊━ ?곌껐??
- Root Directory: `client` ?ㅼ젙
- Framework Preset: `Next.js`

### 2-1. ?먮룞 諛고룷

**`main` 釉뚮옖移섏뿉 push?섎㈃ Vercel???먮룞?쇰줈 鍮뚮뱶 + 諛고룷?쒕떎.**

```powershell
git add .
git commit -m "蹂寃??댁슜"
git push origin main
```

??Vercel ??쒕낫?쒖뿉??鍮뚮뱶 吏꾪뻾 ?곹깭 ?뺤씤 媛??

### 2-2. Vercel ?섍꼍蹂??

Vercel ?꾨줈?앺듃 Settings ??Environment Variables???ㅼ젙:

| 蹂?섎챸                    | ?섍꼍      | 媛?                    |
| -------------------------- | ---------- | ---------------------- |
| `NEST_API_URL`             | All        | `https://api.daloa.kr` |
| `NEXT_PUBLIC_NEST_API_URL` | Production | `https://api.daloa.kr` |

- `NEST_API_URL` ??SSR fetch ???쒕쾭?먯꽌 ?ъ슜 (`page.tsx`??`process.env.NEST_API_URL`)
- `NEXT_PUBLIC_NEST_API_URL` ???대씪?댁뼵??而댄룷?뚰듃?먯꽌 ?ъ슜

### 2-3. ?꾨━酉?諛고룷

- `main` ?댁쇅 釉뚮옖移섏뿉 push?섎㈃ ?꾨━酉?URL???먮룞 ?앹꽦??
- PR?먯꽌 ?꾨━酉??뺤씤 ??癒몄?

---

## 3. ?щ·??(EC2 ?섎룞 ?ㅽ뻾)

```bash
# EC2 ?덉뿉??
cd daloa/crawlers
python3 crawl_rank.py
```

- 濡쒓렇??`crawlers/logs/crawl-YYYY-MM-DD_HH-MM-SS.log`?????
- ?щ줎?≪쑝濡??먮룞?뷀븯?ㅻ㈃:
  ```bash
  # 留ㅼ씪 04:00 KST ?ㅽ뻾 (UTC 19:00)
  crontab -e
  0 19 * * * cd /home/ubuntu/daloa/crawlers && python3 crawl_rank.py >> /dev/null 2>&1
  ```

---

## 4. ?꾨찓??(媛鍮꾩븘 DNS)

| ?꾨찓??        | ???   | 媛?                    | ?⑸룄                 |
| -------------- | ----- | ---------------------- | -------------------- |
| `daloa.kr`     | CNAME | `cname.vercel-dns.com` | ?대씪?댁뼵??(Vercel) |
| `api.daloa.kr` | A     | `3.39.239.9`           | ?쒕쾭 API (EC2)      |

### ?꾨찓??蹂寃???

1. 媛鍮꾩븘 DNS 愿由????덉퐫???섏젙
2. EC2 IP媛 諛붾뚮㈃ `api.daloa.kr` A ?덉퐫???낅뜲?댄듃
3. Vercel ?꾨찓???ㅼ젙?먯꽌 `daloa.kr` ?뺤씤

---

## 5. SSL ?몄쬆??(Let's Encrypt)

```bash
# EC2 ?덉뿉????理쒖큹 諛쒓툒
sudo certbot certonly --standalone -d api.daloa.kr

# ?먮룞 媛깆떊 ?뺤씤
sudo certbot renew --dry-run
```

- ?몄쬆??寃쎈줈: `/etc/letsencrypt/live/api.daloa.kr/`
- Nginx 而⑦뀒?대꼫媛 ?대떦 寃쎈줈瑜??쎄린 ?꾩슜 留덉슫??
- 媛깆떊 ??Nginx ?ъ떆?? `docker restart daloa-nginx`

---

## 6. DB 愿由?

### ?쒓? 源⑥쭚 諛⑹? (utf8mb4)

???곌껐(NestJS `db.module.ts`)? ?대? `charset: utf8mb4`濡??ㅼ젙?섏뼱 ?덈떎.  
?쒓???源⑥????먯씤? **諛고룷/?섎룞 SQL ?ㅽ뻾 ?몄뀡**?먯꽌 ?몄퐫?⑹씠 鍮좎???寃쎌슦?대떎.

**?꾩닔 ?섏튃:**

1. **MySQL 而⑦뀒?대꼫** ???쒕쾭 湲곕낯媛?+ ?몄뀡 紐⑤몢 utf8mb4 媛뺤젣  
   (`docker-compose.yml`??`command` ?먮뒗 `my.cnf`?먯꽌 ?ㅼ젙)
2. **?섎룞 SQL ?ㅽ뻾** ????긽 `--default-character-set=utf8mb4` ?듭뀡 ?ъ슜
3. **PowerShell?먯꽌 ?쒓? SQL 吏곸젒 ?낅젰** ??`chcp 65001` (UTF-8 肄섏넄) ?ㅼ젙 ???ㅽ뻾?섍굅?? UTF-8濡???λ맂 `.sql` ?뚯씪濡??ㅽ뻾

#### EC2 ?몄퐫???먭? 荑쇰━

MySQL 而⑦뀒?대꼫???묒냽:

```bash
docker exec -it daloa-mysql mysql -udaloa -p1234 --default-character-set=utf8mb4 lost_ark
```

?묒냽 ???꾨옒 荑쇰━?ㅼ쓣 ?쒖꽌?濡??ㅽ뻾:

```sql
-- 1) ?쒕쾭 湲곕낯媛??뺤씤 (?꾨? utf8mb4?ъ빞 ?뺤긽)
SHOW VARIABLES LIKE 'character_set_%';
SHOW VARIABLES LIKE 'collation_%';

-- 2) ?꾩옱 ?몄뀡 ?몄퐫???뺤씤
SELECT @@character_set_client, @@character_set_connection, @@character_set_results;

-- 3) ?뚯씠釉붾퀎 charset/collation ?뺤씤
SELECT TABLE_NAME, TABLE_COLLATION
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'lost_ark';

-- 4) 而щ읆蹂?charset ?뺤씤 (臾몄젣 ?덈뒗 而щ읆 李얘린)
SELECT TABLE_NAME, COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = 'lost_ark'
   AND CHARACTER_SET_NAME IS NOT NULL
   AND CHARACTER_SET_NAME != 'utf8mb4';
```

#### 源⑥쭊 ???먯? 荑쇰━

?쒓? 而щ읆??`?` ?먮뒗 鍮꾩젙??諛붿씠?멸? ?ㅼ뼱媛??됱쓣 ?먯?:

```sql
-- loa_users: 罹먮┃?곕챸/?쒕쾭紐?湲몃뱶紐?源⑥쭚
SELECT name, server_name, guild
  FROM loa_users
 WHERE name REGEXP '[?]{2,}'
    OR name != CONVERT(CONVERT(name USING utf8mb4) USING binary)
 LIMIT 20;

-- loa_sites: ?ъ씠?몃챸/?ㅻ챸 源⑥쭚
SELECT name, description
  FROM loa_sites
 WHERE name REGEXP '[?]{2,}'
    OR description REGEXP '[?]{2,}'
 LIMIT 20;

-- loa_class: 吏곸뾽紐?媛곸씤紐?源⑥쭚
SELECT class_detail, class_engraving
  FROM loa_class
 WHERE class_detail REGEXP '[?]{2,}'
    OR class_engraving REGEXP '[?]{2,}'
 LIMIT 20;

-- loa_class_summaries: AI ?쒖쨪??源⑥쭚
SELECT class_name, summary
  FROM loa_class_summaries
 WHERE summary REGEXP '[?]{2,}'
 LIMIT 20;
```

#### ?덉쟾???ъ쟻??紐낅졊 ?쒖꽌

源⑥쭊 ?곗씠?곌? 諛쒓껄?섎㈃ ?꾨옒 ?쒖꽌濡?蹂듦뎄:

```bash
# 1) NestJS 而⑦뀒?대꼫 以묒? (?곌린 諛⑹?)
docker compose stop nest

# 2) 源⑥쭊 ?뚯씠釉?鍮꾩슦湲?(?먮뒗 ?뱀젙 ?됰쭔 DELETE)
docker exec -i daloa-mysql mysql -udaloa -p1234 \
  --default-character-set=utf8mb4 lost_ark \
  -e "TRUNCATE TABLE loa_users;"

# 3) 源⑤걮???ㅽ봽 ?뚯씪 ?곸옱 (諛섎뱶??utf8mb4)
docker exec -i daloa-mysql mysql -udaloa -p1234 \
  --default-character-set=utf8mb4 lost_ark < /home/ubuntu/daloa/scripts/dump.sql

# 4) ?곸옱 ??源⑥쭚 ?ы솗??
docker exec -i daloa-mysql mysql -udaloa -p1234 \
  --default-character-set=utf8mb4 lost_ark \
  -e "SELECT name, server_name FROM loa_users WHERE name REGEXP '[?]{2,}' LIMIT 5;"

# 5) Redis 罹먯떆 ?꾩껜 ??젣 (???곗씠???쒓굅)
docker exec daloa-redis redis-cli -a $REDIS_PASSWORD FLUSHALL

# 6) NestJS 而⑦뀒?대꼫 ?ъ떆??
docker compose up -d --build nest

# 7) API濡??뺤긽 ?묐떟 ?뺤씤
curl -s https://api.daloa.kr/api/sites | head -c 200
```

> **二쇱쓽:** `dump.sql` ?뚯씪 ?먯껜媛 UTF-8(BOM ?놁쓬)濡???λ릺???덉뼱???쒕떎.  
> 濡쒖뺄?먯꽌 `node scripts/dump-db.js` ?ㅽ뻾 ??Node.js??湲곕낯 UTF-8濡?異쒕젰?섎?濡?蹂꾨룄 ?ㅼ젙 遺덊븘??

### ?ㅽ궎留?珥덇린??

```bash
# EC2 ?덉뿉????MySQL 而⑦뀒?대꼫 理쒖큹 湲곕룞 ???먮룞 ?ㅽ뻾
# scripts/init-db.sql ??docker-entrypoint-initdb.d/01-schema.sql
# scripts/dump.sql    ??docker-entrypoint-initdb.d/02-data.sql
```

### ?섎룞 ?ㅽ봽 (濡쒖뺄 ??EC2)

```bash
# 濡쒖뺄?먯꽌 ?ㅽ봽 ?앹꽦
node scripts/dump-db.js

# EC2濡??꾩넚
scp -i "daloa-key.pem" scripts/dump.sql ubuntu@3.39.239.9:~/daloa/scripts/
```

### DB ?곗씠???섎룞 ?섏젙 (SQL ?뚯씪 ?ㅽ뻾)

> ?좑툘 mysql ?ㅽ뻾 ??諛섎뱶??`--default-character-set=utf8mb4` ?듭뀡??遺숈뿬???쒓???源⑥?吏 ?딅뒗??

```powershell
# 1. 濡쒖뺄?먯꽌 SQL ?뚯씪 ?묒꽦 ??EC2濡??꾩넚
scp -i "C:\\Users\\tjdtn\\Desktop\\내가생각하는미래\\개발\\로아사이트 모음\\daloa-key.pem" fix.sql ubuntu@3.39.239.9:/tmp/fix.sql

# 2. EC2 MySQL 而⑦뀒?대꼫?먯꽌 ?ㅽ뻾
ssh -i "C:\\Users\\tjdtn\\Desktop\\내가생각하는미래\\개발\\로아사이트 모음\\daloa-key.pem" -o StrictHostKeyChecking=no ubuntu@3.39.239.9 \
  "docker exec -i daloa-mysql mysql -udaloa -p1234 --default-character-set=utf8mb4 lost_ark < /tmp/fix.sql"

# 3. 愿??Redis 罹먯떆 ??젣 (?? sites)
ssh -i "C:\\Users\\tjdtn\\Desktop\\내가생각하는미래\\개발\\로아사이트 모음\\daloa-key.pem" -o StrictHostKeyChecking=no ubuntu@3.39.239.9 \
  "docker exec daloa-redis redis-cli -a Redis9999! DEL sites:all"
```

---

## 7. 鍮좊Ⅸ 李몄“ ??諛고룷 泥댄겕由ъ뒪??

> **諛고룷 ?ㅽ겕由쏀듃瑜??ъ슜?섎㈃ 罹먯떆 ??젣瑜??먮룞?쇰줈 泥섎━?쒕떎.**

### ?쒕쾭留?蹂寃쏀뻽????

```powershell
# ?ㅽ겕由쏀듃 ?ъ슜 (沅뚯옣 ??dist/ ??젣 ?ы븿)
powershell -File scripts/deploy.ps1

# Redis 罹먯떆???좊━?ㅻ㈃
powershell -File scripts/deploy.ps1 -FlushRedis
```

### ?대씪?댁뼵?몃쭔 蹂寃쏀뻽????

```powershell
git push origin main
# ??Vercel ?먮룞 諛고룷 (.next 罹먯떆??Vercel??愿由?
```

### ????蹂寃쏀뻽????

```powershell
# 1) push (Vercel ?먮룞 諛고룷)
git push origin main

# 2) EC2 ?쒕쾭 諛고룷 (罹먯떆 ??젣 ?ы븿)
powershell -File scripts/deploy.ps1
```

### ?꾩껜 ?쒕퉬???ъ떆??(MySQL/Redis/Nginx ?ы븿)

```powershell
powershell -File scripts/deploy.ps1 -Full
```

### Vercel???쏅궇 ?곗씠?곕? 蹂댁뿬以???(罹먯떆 媛뺤젣 媛깆떊)

```powershell
git commit --allow-empty -m "chore: ?щ같??; git push origin main
```
