# API 계약서

**Base URL (로컬)**: `http://localhost:3001`  
**Base URL (프로덕션)**: `https://api.daloa.kr`

> 응답은 모두 JSON. 에러 응답 형식: `{ statusCode, timestamp, path, message }`

---

## 사이트 모음

### `GET /api/sites`

활성화된 사이트 목록 반환. Redis TTL 10분, 이후 DB 재조회.

**응답 (200)**

```json
[
  {
    "seq": 1,
    "name": "로스트아크",
    "href": "https://lostark.game.onstove.com",
    "category": "공식",
    "description": "공식 홈페이지",
    "icon": "https://..."
  }
]
```

---

## 캐릭터 스탯 빌드

### `GET /api/characters/stat-builds`

치신/신치/치특/특치/신특/특신/치특신 7개 탭 반환. DB 직접 조회(캐시 없음).

**응답 (200)**

```json
[
  {
    "statBuild": "치신",
    "totalCount": 1523,
    "items": [
      {
        "classDetail": "건슬링어",
        "classEngraving": "피스메이커",
        "count": 340,
        "topLevel": 1785
      }
    ]
  }
]
```

- 탭 순서: `["치신", "신치", "치특", "특치", "신특", "특신", "치특신"]` 고정
- `items`는 `count` 내림차순, 동점 시 `topLevel` 내림차순

---

## 유저 (크롤러 전용)

### `POST /api/users/search`

캐릭터명으로 LostArk API 조회 후 원정대 전체를 DB에 upsert.

**요청 Body**

```json
{ "characterName": "캐릭터명" }
```

**응답 (200)**

```json
{
  "expeditionKey": "카단:캐릭터명",
  "saved": 6
}
```

- `saved`: 새로 저장·업데이트된 캐릭터 수
- `characterName` 없거나 빈 문자열 → 400

### `GET /api/users/exists/:name`

캐릭터명이 DB에 존재하는지 확인 (크롤러 중복 체크용).

**응답 (200)**

```json
{ "exists": true }
```

### `GET /api/users/stats`

DB 전체 캐릭터 수 통계.

**응답 (200)**

```json
{ "total": 152340 }
```

---

## 스트리머 (YouTube)

### `GET /api/streamers`

로스트아크 최신 영상 (1시간 이내 업로드). Redis TTL 10분.

**쿼리 파라미터**

- `pageToken` (선택): 다음 페이지 토큰

**응답 (200)**

```json
{
  "videos": [
    {
      "videoId": "abc123",
      "title": "영상 제목",
      "channelTitle": "채널명",
      "thumbnailUrl": "https://...",
      "publishedAt": "2026-04-16T00:00:00Z",
      "duration": "1:23:45",
      "viewCount": 12345
    }
  ],
  "nextPageToken": "xxx"
}
```

- YouTube quota 초과 시 빈 배열 반환 (에러 아님)

### `GET /api/streamers/popular`

최근 7일 로스트아크 영상 최신순 인기 영상. Redis TTL 1시간.

쿼리 파라미터:

- `offset` (optional): 캐시된 인기 영상 목록 시작 위치
- `limit` (optional): 반환 개수. 현재 서버 최대 50개

**응답 (200)**

```json
{
  "items": [
    {
      "videoId": "abc123",
      "title": "영상 제목",
      "channelTitle": "채널명",
      "thumbnailUrl": "https://...",
      "publishedAt": "2026-04-16T00:00:00Z",
      "duration": "12:34",
      "viewCount": 12345
    }
  ],
  "nextOffset": 8,
  "hasMore": true,
  "total": 137
}
```

- `offset`, `limit` 없이 호출하면 캐시된 전체 목록 반환
- 사용자 추가 탐색 시에는 서버 Redis 캐시를 분할 반환하며, 외부 YouTube API를 매번 다시 호출하지 않음
- YouTube quota 초과 시 빈 배열 반환 (에러 아님)

---

## 직업 한줄평 (AI)

### `GET /api/class-summary`

전체 직업 AI 한줄평 목록.

**응답 (200)**

```json
[
  {
    "className": "건슬링어",
    "summary": "...",
    "updatedAt": "2026-04-15T12:00:00.000Z"
  }
]
```

- 데이터 없으면 빈 배열 (크롤링·AI 생성은 서버 시작 시 `OnModuleInit`에서 트리거)

### `GET /api/class-summary/:className`

단일 직업 한줄평.

**응답 (200)** — 위 단일 객체  
**응답 (404)** — 해당 직업 없음

---

## LostArk API 상태

### `GET /api/lostark/stats`

현재 분 LostArk API 호출 횟수 (크롤러 모니터링용).

**응답 (200)**

```json
{
  "callsThisWindow": 42,
  "limit": 80
}
```
