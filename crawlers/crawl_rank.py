#!/usr/bin/env python3
"""
loawa.com/api/rankings/combatpower/detailed 를 호출해
캐릭터명을 수집한 뒤, LostArk API(/api/users/search)로 원정대 전체 데이터를
DB에 저장합니다.

파이프라인 구조:
  Producer -> name_queue -> Checker(x30) -> search_queue -> Searcher
  수집과 DB체크, API요청이 동시에 진행됩니다.

사용법:
    python crawl_rank.py          # 기본값: 데이터 없을 때까지 무제한
    python crawl_rank.py 50       # 최대 50페이지

설치:
    pip install curl-cffi
"""

import sys
import asyncio
from urllib.parse import quote
from curl_cffi.requests import AsyncSession

SERVER_BASE = "http://localhost:3001"
EXISTS_API  = f"{SERVER_BASE}/api/users/exists"
SEARCH_API  = f"{SERVER_BASE}/api/users/search"

LOAWA_API      = "https://loawa.com/api/rankings/combatpower/detailed"
LOAWA_REFERRER = "https://loawa.com/rank/combatpower"
PAGE_SIZE      = 50

EXISTS_CONCURRENCY = 30  # DB 중복 체크 동시 처리 수
SEARCH_CONCURRENCY = 1   # LostArk API 큐가 직렬이므로 1이면 충분
MAX_RETRY          = 3   # 일시적 에러 시 재시도 횟수
RETRY_DELAY        = 5   # 재시도 전 대기(초)


async def fetch_rank_page(session: AsyncSession, page: int, counters: dict, lock: asyncio.Lock) -> list[str]:
    """loawa.com 전투력 순위 API에서 캐릭터명 목록 반환"""
    async with lock:
        counters['current_page'] = page
    try:
        r = await session.get(
            LOAWA_API,
            params={'page': page, 'page_size': PAGE_SIZE},
            headers={
                'Referer':        LOAWA_REFERRER,
                'Origin':         'https://loawa.com',
                'Accept':         'application/json',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f'\n[페이지 {page}] 요청 실패: {e}', flush=True)
        return []

    items = data.get('data', {}).get('items', [])
    names = [item['character_name'] for item in items if item.get('character_name')]
    return names


LOSTARK_STATS_API = f"{SERVER_BASE}/api/lostark/stats"


async def progress_logger(
    name_queue: asyncio.Queue,
    search_queue: asyncio.Queue,
    counters: dict,
    lock: asyncio.Lock,
    stop: asyncio.Event,
    session: AsyncSession,
):
    """1초마다 같은 줄 덮어쓰기로 현황 출력"""
    while not stop.is_set():
        await asyncio.sleep(1)
        async with lock:
            page  = counters.get('current_page', 0)
            saved = counters['saved']
        waiting = name_queue.qsize() + search_queue.qsize()

        # NestJS에서 LostArk API 실제 호출 횟수 조회
        try:
            r = await session.get(LOSTARK_STATS_API, timeout=2)
            stats = r.json()
            calls = stats.get('callsThisWindow', '?')
            limit = stats.get('limit', 80)
            api_info = f'API {calls}/{limit}회'
        except Exception:
            api_info = 'API ?회'

        line = (
            f'현재페이지 {page} / '
            f'대기자 {waiting}명 / '
            f'{api_info} / '
            f'완료 {saved}명'
        )
        print(f'\r{line}', end='', flush=True)


async def call_search(
    session: AsyncSession,
    sem: asyncio.Semaphore,
    name: str,
    idx: int,
    done_expeditions: set[str],
    lock: asyncio.Lock,
    counters: dict,
):
    async with sem:
        async with lock:
            counters['active'] = counters.get('active', 0) + 1

        result = None
        for attempt in range(1, MAX_RETRY + 1):
            try:
                r = await session.post(SEARCH_API, json={'characterName': name}, timeout=300)
                body = r.json()
                # NestJS 에러 응답: {statusCode, message, ...}
                if 'statusCode' in body and body['statusCode'] >= 400:
                    raise RuntimeError(f'HTTP {body["statusCode"]}: {body.get("message")}')
                result = body
                break
            except Exception as e:
                if attempt < MAX_RETRY:
                    await asyncio.sleep(RETRY_DELAY)
                else:
                    print(f'\n[ERROR] {name}: {e}', flush=True)
                    async with lock:
                        counters['errors'] += 1
                        counters['active'] -= 1
                    return

        if result is None:
            async with lock:
                counters['active'] -= 1
            return

        exp_key = result.get('expeditionKey', '')
        async with lock:
            counters['active'] -= 1
            if exp_key in done_expeditions:
                counters['skipped'] += 1
            else:
                done_expeditions.add(exp_key)
                cnt = result.get('saved', 0)
                counters['saved'] += cnt


async def crawl(total_pages: int = 999):
    done_expeditions: set[str] = set()
    lock     = asyncio.Lock()
    counters = {'saved': 0, 'skipped': 0, 'errors': 0, 'active': 0, 'current_page': 0}

    name_queue   = asyncio.Queue()  # loawa 이름 -> 체커
    search_queue = asyncio.Queue()  # 신규 이름  -> 서처

    exists_sem = asyncio.Semaphore(EXISTS_CONCURRENCY)
    search_sem = asyncio.Semaphore(SEARCH_CONCURRENCY)

    async with AsyncSession(impersonate='chrome124') as session:

        # -- Producer: 페이지 수집 -> name_queue --
        async def producer():
            await session.get(LOAWA_REFERRER, timeout=15)
            for pg in range(1, total_pages + 1):
                names = await fetch_rank_page(session, pg, counters, lock)
                if not names:
                    break
                for name in names:
                    await name_queue.put(name)
                await asyncio.sleep(1)
            # 체커 워커 수만큼 종료 신호
            for _ in range(EXISTS_CONCURRENCY):
                await name_queue.put(None)

        # -- Checker worker: name_queue -> DB 체크 -> search_queue --
        async def checker_worker():
            while True:
                name = await name_queue.get()
                if name is None:
                    name_queue.task_done()
                    return
                async with exists_sem:
                    try:
                        r = await session.get(
                            f"{EXISTS_API}/{quote(name, safe='')}", timeout=5
                        )
                        exists = r.json().get('exists', False)
                    except Exception:
                        exists = False
                if exists:
                    async with lock:
                        counters['skipped'] += 1
                else:
                    await search_queue.put(name)
                name_queue.task_done()

        # -- Checker coordinator: 모든 checker 완료 시 searcher 종료 신호 --
        async def checker_coordinator():
            workers = [
                asyncio.create_task(checker_worker())
                for _ in range(EXISTS_CONCURRENCY)
            ]
            await asyncio.gather(*workers)
            await search_queue.put(None)

        # -- Searcher: search_queue -> call_search --
        async def searcher():
            idx = 0
            while True:
                name = await search_queue.get()
                if name is None:
                    break
                idx += 1
                await call_search(session, search_sem, name, idx,
                                  done_expeditions, lock, counters)

        # -- 진행 상황 로거 --
        stop_event = asyncio.Event()
        logger = asyncio.create_task(
            progress_logger(name_queue, search_queue, counters, lock, stop_event, session)
        )

        # 세 파이프라인을 동시에 실행
        await asyncio.gather(producer(), checker_coordinator(), searcher())

        stop_event.set()
        await logger

    print(f'\n============================')
    print(f'완료: {len(done_expeditions)}개 원정대 처리')
    print(f'저장: {counters["saved"]}명 / 스킵: {counters["skipped"]}명 / 에러: {counters["errors"]}명')


if __name__ == '__main__':
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 999
    asyncio.run(crawl(total_pages=pages))