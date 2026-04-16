# Redis 키 목록

**Redis DB**: `0` (기본값)

> 키를 추가·변경할 때 이 파일과 해당 서비스 파일의 상수를 동시에 수정한다.

---

## 사이트 (`SitesService`)

| 키          | 타입          | TTL          | 무효화 시점                           | 선언 위치          |
| ----------- | ------------- | ------------ | ------------------------------------- | ------------------ |
| `sites:all` | String (JSON) | 600초 (10분) | 크론 점검(`checkSites`) 완료 후 `DEL` | `sites.service.ts` |

**값 형태**

```json
[
  {
    "seq": 1,
    "name": "...",
    "href": "...",
    "category": "...",
    "description": "...",
    "icon": "..."
  }
]
```

---

## 유튜버 영상 (`StreamersService`)

| 키                                | 타입           | TTL                             | 무효화 시점                |
| --------------------------------- | -------------- | ------------------------------- | -------------------------- |
| `youtube:videos:page:first`       | String (JSON)  | 3600초 (1시간)                  | 크론 갱신 시 덮어쓰기      |
| `youtube:videos:page:{pageToken}` | String (JSON)  | 3600초 (1시간)                  | 자연 만료                  |
| `youtube:popular:first`           | String (JSON)  | 7200초 (2시간)                  | 자연 만료                  |
| `youtube:quota_exceeded`          | String (`"1"`) | YouTube 할당량 리셋까지 남은 초 | 자연 만료 (KST 16:00 리셋) |

**`youtube:videos:page:*` 값 형태**

```json
{
  "videos": [
    {
      "videoId": "abc123",
      "title": "...",
      "channelTitle": "...",
      "thumbnailUrl": "...",
      "publishedAt": "2026-04-16T00:00:00Z",
      "duration": "1:23:45",
      "viewCount": 12345
    }
  ],
  "nextPageToken": "xxx"
}
```

**`youtube:quota_exceeded` 동작**

- YouTube API에서 `quotaExceeded` 에러 → TTL = 다음 KST 16:00(= UTC 07:00)까지 초
- 이 키가 존재하는 동안 모든 YouTube API 호출 차단
- TTL 만료 후 자동으로 API 호출 재개 (수동 개입 불필요)

---

## OnModuleInit 최적화

`StreamersService.onModuleInit`에서 `youtube:videos:page:first` 가 존재하면 YouTube API 호출 없이 종료.  
서버 재시작 횟수가 많아도 할당량 소비 없음. (`diary.md` 문제 1 참조)

---

## 키 디버깅 명령

```bash
# 전체 키 조회
redis-cli keys '*'

# 사이트 캐시 확인
redis-cli get sites:all

# 유튜브 quota 차단 여부
redis-cli ttl youtube:quota_exceeded

# 캐시 수동 삭제
redis-cli del sites:all
redis-cli del youtube:quota_exceeded
```
