# 환경변수 설정

**위치**: 프로젝트 루트 `.env` (`.gitignore`에 포함 — 커밋 금지)

---

## 서버 (NestJS)

| 변수명                     | 기본값                  | 필수     | 설명                                        |
| -------------------------- | ----------------------- | -------- | ------------------------------------------- |
| `PORT`                     | `3001`                  | -        | NestJS 리스닝 포트                          |
| `CLIENT_ORIGIN`            | `http://localhost:3000` | -        | CORS 허용 출처 (쉼표 구분 복수 허용)        |
| `DB_HOST`                  | `127.0.0.1`             | -        | MariaDB 호스트                              |
| `DB_PORT`                  | `3306`                  | -        | MariaDB 포트                                |
| `DB_NAME`                  | `lost_ark`              | -        | DB 이름                                     |
| `DB_USER`                  | `root`                  | -        | DB 유저                                     |
| `DB_PASS`                  | `''`                    | **필수** | DB 비밀번호                                 |
| `REDIS_HOST`               | `127.0.0.1`             | -        | Redis 호스트                                |
| `REDIS_PORT`               | `6379`                  | -        | Redis 포트                                  |
| `REDIS_PASSWORD`           | (없음)                  | -        | Redis 비밀번호 (없으면 미설정)              |
| `REDIS_DB`                 | `0`                     | -        | Redis DB 번호                               |
| `LOCAL_DISABLE_QUOTA_APIS` | `false`                 | -        | 로컬 개발에서 YouTube/Gemini 외부 호출 차단 |
| `LOSTARK_API_KEY`          | -                       | **필수** | LostArk Open API 키                         |
| `YOUTUBE_API_KEY`          | -                       | **필수** | YouTube Data API v3 키                      |
| `GEMINI_API_KEY`           | -                       | **필수** | Google Gemini API 키                        |
| `KAKAO_REST_API_KEY`       | -                       | **필수** | 카카오 REST API 키                          |
| `KAKAO_REFRESH_TOKEN`      | -                       | **필수** | 카카오 OAuth 리프레시 토큰                  |

### CORS 설정 주의

`CLIENT_ORIGIN`에 도메인을 입력하면 `www.` 서브도메인이 자동 추가됨.  
예: `https://daloa.kr` → `https://daloa.kr`, `https://www.daloa.kr` 동시 허용.

---

## 클라이언트 (Next.js)

| 변수명         | 기본값                  | 필수 | 설명                      |
| -------------- | ----------------------- | ---- | ------------------------- |
| `NEST_API_URL` | `http://localhost:3001` | -    | SSR fetch 대상 NestJS URL |

> Next.js에서 서버 전용 변수는 `NEXT_PUBLIC_` 접두사 없이 사용.  
> 브라우저에서 NestJS를 직접 호출하는 코드 없음.

---

## 로컬 개발 `.env` 예시

```dotenv
# DB
DB_PASS=1234

# Redis (로컬은 패스워드 없음)
REDIS_HOST=127.0.0.1

# 로컬 개발 중 YouTube/Gemini 할당량 보호
LOCAL_DISABLE_QUOTA_APIS=true

# API Keys
LOSTARK_API_KEY=eyJ0eXAiOiJKV1Q...
YOUTUBE_API_KEY=AIzaSy...
GEMINI_API_KEY=AIzaSy...

# Kakao
KAKAO_REST_API_KEY=abc123...
KAKAO_REFRESH_TOKEN=xyz456...

# CORS
CLIENT_ORIGIN=http://localhost:3000
```

---

## 카카오 토큰 최초 발급 절차

1. [developers.kakao.com](https://developers.kakao.com) → 앱 생성 → 카카오 로그인 활성화
2. 플랫폼 > Web > `http://localhost` 등록
3. 아래 URL로 인가 코드 발급  
   `https://kauth.kakao.com/oauth/authorize?client_id={REST_API_KEY}&redirect_uri=http://localhost&response_type=code`
4. 리다이렉트 URL의 `code=` 값 복사
5. curl로 토큰 발급
   ```bash
   curl -X POST https://kauth.kakao.com/oauth/token \
     -d grant_type=authorization_code \
     -d client_id={REST_API_KEY} \
     -d redirect_uri=http://localhost \
     -d code={code값}
   ```
6. 응답의 `refresh_token` → `.env KAKAO_REFRESH_TOKEN`에 저장  
   (유효기간 2개월, 만료 전 자동 갱신됨)
