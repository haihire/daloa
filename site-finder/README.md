# site-finder — 인벤 커뮤니티에서 신규 사이트 발굴

로스트아크 인벤 자유게시판·팁게시판을 크롤링 → 게시글·댓글에서 언급된
**아직 등록되지 않은 사이트 URL**을 추출해 관리자에게 추천 후보로 제시.
(AI 미사용 — 규칙 기반 추출. 이름·설명은 관리자가 직접 입력)

## 아키텍처 (DB는 전부 Nest/Prisma가 담당)

```
crawl.py (Python)            Nest (AdminInvenPipelineService)
─────────────────           ──────────────────────────────────
크롤링 → stdout JSON   ──▶   JSON 파싱
(DB 접근 없음)               → inven_posts upsert        (Prisma)
                             → URL 추출·필터              (SiteExtractorService)
                             → inven_site_candidates 저장 (Prisma)
```

- **Python은 DB를 모른다.** `crawl.py`는 크롤 결과를 **stdout에 JSON으로만** 출력한다.
- **DB 읽기/쓰기는 전부 Nest의 Prisma**가 한다. (트랜잭션·타입 일원화)
- URL 추출·필터 로직은 Nest `SiteExtractorService`에 있다 (이전 `extract_sites.py` 대체).

> ⚠️ **이 폴더는 크롤러(`crawl.py`) 하나만 있는 로컬 작업 공간.**
> 저장·추출·관리자 UI는 모두 `server/src/admin/` 쪽에 있다.

## 대상 게시판

| key  | 이름       | board id | URL                                        |
| ---- | ---------- | -------- | ------------------------------------------ |
| free | 자유게시판 | 6271     | https://www.inven.co.kr/board/lostark/6271 |
| tip  | 팁과노하우 | 4821     | https://www.inven.co.kr/board/lostark/4821 |

> ⚠️ 데스크톱(www) 정상 작동. **잘못된 board id면 모바일 검색으로 JS 리다이렉트**되어 0개 파싱됨.
> curl_cffi `impersonate="chrome"` 필수 (없으면 봇 차단).

## 댓글 수집 (2026-08-11~)

게시글 페이지 HTML의 댓글 영역은 **빈 div**로 내려온다 — `PwCMT.js`가 아래 API를 POST로
호출해 채우는 구조라, HTML만 긁으면 댓글은 영원히 0개다.

```
POST https://www.inven.co.kr/common/board/comment.json.php
     comeidx=6271 & articlecode=<post_id> & act=list & out=json & sortorder=date
→ {"cmtcount": n, "commentlist": [{"list": [{o_name, o_date, o_comment, o_recommend, ...}]}]}
```

- 로그인·쿠키 없이 열람 가능. `o_comment`는 HTML이 엔티티로 이스케이프된 문자열 → `unescape` 후 파싱.
- 한 번에 최대 100개(`pagecount`)까지. 그 이상 달린 글은 앞쪽 블록만 들어온다.
- 본문(HTML)과 댓글(JSON)은 **게시글당 동시에** 요청한다. 순차로 하면 런 시간이 그대로 2배가 된다.
  대신 순간 요청률이 2배가 되므로 게시글 간 대기를 0.4 → 0.5초로 올렸다(`--delay`로 조절).
- `--no-comments` 로 끌 수 있다(Nest 쪽은 `INVEN_COLLECT_COMMENTS=0`).

### 링크는 텍스트가 아니라 href에서 나온다

본문·댓글 모두 `get_text()`로 텍스트만 뽑으면 `<a href="...">여기</a>` 형태의 링크가 **통째로 사라진다**.
그래서 본문은 `links`, 댓글은 `comments[].links` 로 `<a href>` 절대 URL을 따로 담아 보낸다.

## 사이트 추출 로직 (Nest `SiteExtractorService`)

1. 게시글 본문 텍스트·본문 링크 + 댓글 텍스트·댓글 링크에서 모든 `http(s)://` URL 추출
2. **제외**: 인벤 자체(upload/imart 등), lomoa, 유튜브/X/네이버 등 대형 플랫폼, 게임 공식
3. **제외**: 이미 `loa_sites`에 등록된 도메인 (루트 도메인까지 비교)
4. **제외**: `inven_site_blacklist`에 등록된 도메인 (관리자가 거부한 것)
5. `inven_site_candidates` 에 `status='pending'`으로 누적 저장 (이름/설명은 빈 값)

`mention_count`는 **한 글에서 같은 도메인이 몇 번 나오든 1회**로 센다 = "언급한 글 수".
(댓글까지 스캔하면서 스티커·짤 링크가 한 글에 수십 번 반복되는 경우가 생겨, 그대로 세면
노출 임계값이 글 하나로 뚫린다)

노출 임계값은 **조회 시점**에 적용한다 — 기본 누적 2회 이상,
관리자 화면의 「1회 언급 포함」 토글을 켜면 1회짜리까지 보인다(`?minMentions=1`).

## 관리자 페이지 (사이트 추천 탭)

- **🔎 추천 사이트**: `pending` 후보 목록.
  - 「+ 사이트 추가」 → 모달에서 이름/설명/카테고리 입력 → `loa_sites` 등록 + `status='added'`
  - 「블랙리스트 등록」 → `status='rejected'` + `inven_site_blacklist`에 도메인 추가 (다음 수집부터 제외)
- **⚙️ 수집 실행**: 수동 파이프라인 실행 버튼 + 진행률

## DB (Prisma 모델 — `server/prisma/schema.prisma`)

```
inven_posts            게시글 (댓글은 comments JSONB 컬럼에 같이 저장)
inven_site_candidates  추출된 사이트 후보 (이름/설명은 관리자가 입력)
                       status: pending | added | rejected
inven_site_blacklist   거부한 도메인 (다음 수집부터 제외)
```

자동 실행: NestJS `AdminInvenCronService` 가 매일 새벽 02~05시(KST) 정각 4회 증분 실행
(`SITE_FINDER_DIR` 환경변수로 crawl.py 경로 지정, Docker는 `/site-finder` 볼륨).
