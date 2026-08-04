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

## 사이트 추출 로직 (Nest `SiteExtractorService`)

1. 게시글 본문 + 댓글에서 모든 `http(s)://` URL 추출
2. **제외**: 인벤 자체(upload/imart 등), lomoa, 유튜브/X/네이버 등 대형 플랫폼, 게임 공식
3. **제외**: 이미 `loa_sites`에 등록된 도메인 (루트 도메인까지 비교)
4. **제외**: `inven_site_blacklist`에 등록된 도메인 (관리자가 거부한 것)
5. 언급 2회 이상 도메인만 후보로
6. `inven_site_candidates` 에 `status='pending'`으로 저장 (이름/설명은 빈 값)

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

자동 실행: NestJS `AdminInvenCronService` 가 매일 새벽 3시(KST) 파이프라인 실행
(`SITE_FINDER_DIR` 환경변수로 crawl.py 경로 지정, Docker는 `/site-finder` 볼륨).
