import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { AdminSyncController } from './admin-sync.controller';

type MockPool = {
  getConnection: jest.Mock;
  query: jest.Mock;
};

function createController(nodeEnv = 'production') {
  const pool: MockPool = {
    getConnection: jest.fn(),
    query: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        NODE_ENV: nodeEnv,
        SYNC_TARGET_API_URL: 'https://remote.example.com',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const authService = {
    login: jest.fn(),
  } as never;

  const controller = new AdminSyncController(pool as never, config, authService);
  return { controller, pool };
}

function mockResponse(body: string) {
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as Response;
}

function collectEvents<T>(stream: Observable<T>) {
  return new Promise<T[]>((resolve, reject) => {
    const items: T[] = [];
    stream.subscribe({
      next: (value) => items.push(value),
      error: reject,
      complete: () => resolve(items),
    });
  });
}

describe('AdminSyncController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chunkRead uses a dynamic seq index and bound parameters', async () => {
    const { controller, pool } = createController();
    pool.query.mockResolvedValueOnce([
      [
        {
          seq: 42,
          name: 'site-a',
          href: 'https://example.com',
          category: 'news',
          description: null,
          icon: null,
          is_active: 1,
          last_title: 'title',
          last_status: 'ok',
          checked_at: '2025-01-01 00:00:00',
        },
      ],
    ]);

    const result = await controller.chunkRead('sites', {
      afterSeq: 5,
      limit: 100,
    });

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT `seq`, `name`, `href`, `category`, `description`, `icon`, `is_active`, `last_title`, `last_status`, `checked_at` FROM `loa_sites` WHERE seq > ? ORDER BY seq ASC LIMIT ?',
      [5, 25],
    );
    expect(result).toEqual({
      rows: [
        [
          42,
          'site-a',
          'https://example.com',
          'news',
          null,
          null,
          1,
          'title',
          'ok',
          '2025-01-01 00:00:00',
        ],
      ],
      lastSeq: 42,
    });
  });

  it('prod-to-local sends local rows to the remote target without truncating the local DB', async () => {
    const { controller, pool } = createController('production');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/begin')) {
          return mockResponse('{"ok":true}') as never;
        }
        if (url.endsWith('/chunk')) {
          return mockResponse('{"inserted":2}') as never;
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );
    jest.spyOn(globalThis, 'setTimeout').mockImplementation((cb: TimerHandler) => {
      if (typeof cb === 'function') {
        cb();
      }
      return 0 as never;
    });

    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([
        [
          {
            seq: 1,
            name: 'site-a',
            href: 'https://example.com/a',
            category: 'news',
            description: 'desc-a',
            icon: 'icon-a',
            is_active: 1,
            last_title: 'title-a',
            last_status: 'ok',
            checked_at: '2025-01-01 00:00:00',
          },
          {
            seq: 2,
            name: 'site-b',
            href: 'https://example.com/b',
            category: 'news',
            description: 'desc-b',
            icon: 'icon-b',
            is_active: 1,
            last_title: 'title-b',
            last_status: 'ok',
            checked_at: '2025-01-01 00:00:01',
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);

    const events = await collectEvents(
      controller.run('sites', 'remote-session', 'prod-to-local'),
    );

    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/begin');
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('/chunk');
    expect(String(fetchSpy.mock.calls[2]?.[0])).toContain('/auth/logout');
    expect(events.some((event) => event.type === 'done')).toBe(true);
  });
});
