import { execFile } from 'child_process';
import { DockerStatsService } from './docker-stats.service';
import type { MonitoringRepository } from './repositories/monitoring.repository';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

const mockedExecFile = jest.mocked(execFile);

function createService() {
  const saveDockerMetric = jest.fn().mockResolvedValue(undefined);
  const findDockerMetricSeries = jest.fn().mockResolvedValue([]);
  const deleteDockerMetricsOlderThan = jest.fn().mockResolvedValue(undefined);
  const repo = {
    saveDockerMetric,
    findDockerMetricSeries,
    deleteDockerMetricsOlderThan,
  } as unknown as MonitoringRepository;
  return {
    service: new DockerStatsService(repo),
    saveDockerMetric,
    findDockerMetricSeries,
  };
}

function mockExecSuccess(stdout: string) {
  (mockedExecFile as jest.Mock).mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1];
    (callback as (err: null, out: { stdout: string }) => void)(null, {
      stdout,
    });
  });
}

function mockExecError(message: string) {
  (mockedExecFile as jest.Mock).mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1];
    (callback as (err: Error) => void)(new Error(message));
  });
}

function dockerLine(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    Name: 'lomoa-nest',
    CPUPerc: '5.00%',
    MemUsage: '100MiB / 1GiB',
    MemPerc: '10.00%',
    NetIO: '1MiB / 2MiB',
    ...overrides,
  });
}

describe('DockerStatsService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getContainerStats', () => {
    it('parses a known container correctly', async () => {
      const { service } = createService();
      mockExecSuccess(dockerLine());

      const stats = await service.getContainerStats();

      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        name: 'lomoa-nest',
        label: 'nest',
        cpuPercent: 5,
        memPercent: 10,
        memUsedMb: 100,
        memTotalMb: 1024,
      });
    });

    it('filters out containers not in CONTAINER_LABELS', async () => {
      const { service } = createService();
      mockExecSuccess(
        [
          dockerLine({ Name: 'lomoa-nest' }),
          dockerLine({ Name: 'unknown-container' }),
        ].join('\n'),
      );

      const stats = await service.getContainerStats();

      expect(stats).toHaveLength(1);
      expect(stats[0].name).toBe('lomoa-nest');
    });

    it('recognises local-lomoa-* container names', async () => {
      const { service } = createService();
      mockExecSuccess(dockerLine({ Name: 'local-lomoa-nest' }));

      const stats = await service.getContainerStats();

      expect(stats).toHaveLength(1);
      expect(stats[0].label).toBe('nest');
    });

    it('returns [] when docker stats command fails', async () => {
      const { service } = createService();
      mockExecError('docker daemon not running');

      const stats = await service.getContainerStats();

      expect(stats).toEqual([]);
    });

    it('skips lines with invalid JSON', async () => {
      const { service } = createService();
      mockExecSuccess(['not-json', dockerLine()].join('\n'));

      const stats = await service.getContainerStats();

      expect(stats).toHaveLength(1);
    });

    it('converts GB units to MB correctly', async () => {
      const { service } = createService();
      mockExecSuccess(dockerLine({ MemUsage: '1GiB / 2GiB' }));

      const stats = await service.getContainerStats();

      expect(stats[0].memUsedMb).toBeCloseTo(1024, 0);
      expect(stats[0].memTotalMb).toBeCloseTo(2048, 0);
    });

    it('treats non-finite CPU/mem percentages as 0', async () => {
      const { service } = createService();
      mockExecSuccess(dockerLine({ CPUPerc: '--', MemPerc: '--' }));

      const stats = await service.getContainerStats();

      expect(stats[0].cpuPercent).toBe(0);
      expect(stats[0].memPercent).toBe(0);
    });
  });

  describe('getContainerHistory', () => {
    it('returns mapped history points from repository', async () => {
      const { service, findDockerMetricSeries } = createService();
      findDockerMetricSeries.mockResolvedValueOnce([
        {
          bucket: '05-28 01:00',
          avg_cpu: '3.5',
          avg_mem: '12.0',
          avg_mem_used_mb: '256',
        },
      ]);

      const result = await service.getContainerHistory('nest');

      expect(result).toEqual([
        { bucket: '05-28 01:00', avgCpu: 3.5, avgMem: 12.0, avgMemUsedMb: 256 },
      ]);
      expect(findDockerMetricSeries).toHaveBeenCalledWith('nest', 7);
    });

    it('falls back to "nest" for an invalid container name', async () => {
      const { service, findDockerMetricSeries } = createService();
      findDockerMetricSeries.mockResolvedValueOnce([]);

      await service.getContainerHistory('invalid-container');

      expect(findDockerMetricSeries).toHaveBeenCalledWith('nest', 7);
    });

    it('accepts all valid container names', async () => {
      const { service, findDockerMetricSeries } = createService();
      findDockerMetricSeries.mockResolvedValue([]);

      for (const name of ['nest', 'nginx', 'redis', 'postgres']) {
        await service.getContainerHistory(name);
      }

      const calledNames = (
        findDockerMetricSeries.mock.calls as [string, number][]
      ).map((c) => c[0]);
      expect(calledNames).toEqual(['nest', 'nginx', 'redis', 'postgres']);
    });
  });

  describe('getContainerStatuses', () => {
    function psLine(overrides: Record<string, string> = {}): string {
      return JSON.stringify({
        Names: 'lomoa-nest',
        State: 'running',
        Status: 'Up 3 hours (healthy)',
        ...overrides,
      });
    }

    it('parses state, status, and health for a known container', async () => {
      const { service } = createService();
      mockExecSuccess(psLine());

      const statuses = await service.getContainerStatuses();

      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toMatchObject({
        name: 'lomoa-nest',
        label: 'nest',
        state: 'running',
        status: 'Up 3 hours (healthy)',
        health: 'healthy',
      });
    });

    it('includes exited containers with empty health', async () => {
      const { service } = createService();
      mockExecSuccess(
        psLine({
          Names: 'lomoa-redis',
          State: 'exited',
          Status: 'Exited (0) 5 minutes ago',
        }),
      );

      const statuses = await service.getContainerStatuses();

      expect(statuses[0]).toMatchObject({
        label: 'redis',
        state: 'exited',
        health: '',
      });
    });

    it('filters out unknown containers', async () => {
      const { service } = createService();
      mockExecSuccess([psLine(), psLine({ Names: 'unrelated' })].join('\n'));

      const statuses = await service.getContainerStatuses();

      expect(statuses).toHaveLength(1);
      expect(statuses[0].label).toBe('nest');
    });

    it('returns [] when docker ps fails', async () => {
      const { service } = createService();
      mockExecError('docker daemon not running');

      const statuses = await service.getContainerStatuses();

      expect(statuses).toEqual([]);
    });
  });

  describe('saveContainerStats', () => {
    it('saves metrics for each recognised container', async () => {
      const { service, saveDockerMetric } = createService();
      mockExecSuccess(
        [
          dockerLine({ Name: 'lomoa-nest' }),
          dockerLine({
            Name: 'lomoa-redis',
            CPUPerc: '1.00%',
            MemUsage: '50MiB / 500MiB',
            MemPerc: '10.00%',
          }),
        ].join('\n'),
      );

      await service.saveContainerStats();

      expect(saveDockerMetric).toHaveBeenCalledTimes(2);
      expect(saveDockerMetric).toHaveBeenCalledWith(
        'nest',
        expect.objectContaining({ cpuPercent: 5 }),
      );
      expect(saveDockerMetric).toHaveBeenCalledWith(
        'redis',
        expect.objectContaining({ cpuPercent: 1 }),
      );
    });

    it('does nothing when docker stats returns no matching containers', async () => {
      const { service, saveDockerMetric } = createService();
      mockExecSuccess(dockerLine({ Name: 'unrelated-container' }));

      await service.saveContainerStats();

      expect(saveDockerMetric).not.toHaveBeenCalled();
    });
  });
});
