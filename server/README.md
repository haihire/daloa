# Server (NestJS)

로스트아크 대시보드 백엔드. NestJS + MySQL + Redis + YouTube Data API + 로스트아크 공식 API.

---

## 실행

```bash
cd server
npm install
npm run start:dev  # http://localhost:3001
```

`.env` 설정:

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:3000

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=lost_ark
DB_USER=root
DB_PASS=1234

# 로스트아크 공식 API
LOSTARK_API_KEY=...

# YouTube Data API v3
YOUTUBE_API_KEY=...

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0

# 카카오 알림 (사이트 변경 감지)
KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...
KAKAO_REFRESH_TOKEN=...
```

---

## 구조

```
server/src/
├── main.ts               # 부트스트랩, CORS, 전역 필터
├── app.module.ts         # 모듈 조합
│
├── db/                   # MySQL 연결 풀 (DB_POOL 토큰)
├── redis/                # ioredis 클라이언트 (REDIS_CLIENT 토큰)
├── common/               # AllExceptionsFilter — 500 에러 시 카카오 알림
│
├── lostark/              # 로스트아크 API 래퍼 (fetchSiblings, fetchArmory)
├── sites/                # GET /api/sites  (Redis 캐시 + 매일 09:00 상태 점검)
├── streamers/            # GET /api/streamers?page=&size=  (YouTube 라이브, 5분 캐시)
├── characters/           # GET /api/characters/stat-builds
└── users/                # POST /api/users/search  (원정대 upsert)
                          # GET  /api/users/stats
```

---

## API 엔드포인트

| 메서드 | 경로                          | 설명                                           |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/sites`                  | 사이트 목록 (DB + Redis 캐시)                  |
| GET    | `/api/streamers`              | 유튜브 라이브 목록 (`page`, `size` 쿼리)       |
| GET    | `/api/characters/stat-builds` | 특성 빌드별 직업 분포                          |
| POST   | `/api/users/search`           | 원정대 검색 및 DB upsert (`{ characterName }`) |
| GET    | `/api/users/stats`            | 저장된 유저/원정대 통계                        |

---

## 주요 로직

### 특성 빌드 분류 (`characters.service.ts`)

`loa_users.stat_crit/spec/swift` (ArmoryProfile.Stats에서 파싱) 기준:

| 조건                | 분류                                                |
| ------------------- | --------------------------------------------------- |
| 스탯 3개 모두 ≥ 100 | 치특신                                              |
| 스탯 2개 ≥ 100      | 높은 순서로 앞글자 (예: 치명 1500, 신속 600 → 치신) |
| 스탯 1개만 ≥ 100    | 1순위 스탯 기준 쌍으로 분류                         |
| 모두 < 100          | 미설정                                              |

### 유저 upsert (`users.service.ts`)

1. `characterName`으로 원정대 전체 조회 (`/characters/{name}/siblings`)
2. 아이템레벨 상위 6명 = `theSix` 플래그
3. 각 캐릭터 armory 조회 → stat 파싱 → `loa_users` upsert
4. `loa_class` 테이블과 JOIN으로 `class_engraving` 연결

### 스트리머 갱신 (`streamers.service.ts`)

- 서버 시작 시 즉시 조회, 이후 5분마다 YouTube API 재조회
- 결과는 Redis에 5분 TTL로 캐시

### 사이트 점검 (`sites.service.ts`)

- 매일 09:00 각 사이트 HTTP 상태·타이틀 점검
- 변경 감지 시 카카오톡 메시지 발송

---

## 크롤러

`crawlers/crawl-loawa.js` — loawa.com 전투력 상위 캐릭터명으로 `/api/users/search` 일괄 호출

```bash
# 루트에서 실행 (서버가 먼저 실행 중이어야 함)
node crawlers/crawl-loawa.js
```

<a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
<a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
<a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>

</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
