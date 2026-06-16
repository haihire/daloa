import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { promisify } from 'util';
import {
  MonitoringRepository,
  ContainerName,
  ContainerHistoryRow,
} from './repositories/monitoring.repository';

const execFileAsync = promisify(execFile);

export interface ContainerStat {
  name: string;
  label: string;
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
}

export interface HostStats {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskPercent: number;
}

export interface ContainerHistoryPoint {
  bucket: string;
  avgCpu: number;
  avgMem: number;
  avgMemUsedMb: number;
}

export interface ContainerStatus {
  name: string;
  label: string;
  state: string; // running | exited | restarting | ...
  status: string; // 원문 (예: "Up 3 hours (healthy)")
  health: string; // healthy | unhealthy | starting | '' (헬스체크 없음)
}

const CONTAINER_LABELS: Record<string, string> = {
  'lomoa-nest': 'nest',
  'lomoa-nginx': 'nginx',
  'lomoa-redis': 'redis',
  'lomoa-postgres': 'postgres',
  'local-lomoa-nest': 'nest',
  'local-lomoa-redis': 'redis',
  // 전환기 호환: 구 daloa 컨테이너명 (EC2 재배포 후 제거 가능)
  'daloa-nest': 'nest',
  'daloa-nginx': 'nginx',
  'daloa-redis': 'redis',
  'daloa-postgres': 'postgres',
  'local-daloa-nest': 'nest',
  'local-daloa-redis': 'redis',
};

const VALID_CONTAINERS: ContainerName[] = [
  'nest',
  'nginx',
  'redis',
  'postgres',
];

function parseBytes(str: string): number {
  const num = parseFloat(str);
  if (!Number.isFinite(num)) return 0;
  const unit = str
    .replace(/[\d.\s]/g, '')
    .trim()
    .toUpperCase();
  const map: Record<string, number> = {
    B: 1,
    KB: 1e3,
    KIB: 1024,
    MB: 1e6,
    MIB: 1024 ** 2,
    GB: 1e9,
    GIB: 1024 ** 3,
    TB: 1e12,
    TIB: 1024 ** 4,
  };
  return num * (map[unit] ?? 1);
}

function toMb(bytes: number): number {
  return Number((bytes / 1024 / 1024).toFixed(1));
}

@Injectable()
export class DockerStatsService {
  private readonly logger = new Logger(DockerStatsService.name);

  constructor(private readonly monitoringRepo: MonitoringRepository) {}

  async getContainerStats(): Promise<ContainerStat[]> {
    try {
      const { stdout } = await execFileAsync(
        'docker',
        ['stats', '--no-stream', '--format', '{{json .}}'],
        { timeout: 10000 },
      );

      const stats: ContainerStat[] = [];

      for (const line of stdout.trim().split('\n')) {
        if (!line.trim()) continue;
        let raw: Record<string, string>;
        try {
          raw = JSON.parse(line) as Record<string, string>;
        } catch {
          continue;
        }

        const name = (raw['Name'] ?? raw['name'] ?? '').replace(/^\//, '');
        const label = CONTAINER_LABELS[name];
        if (!label) continue;

        const cpuPercent = parseFloat(
          raw['CPUPerc'] ?? raw['cpu_percent'] ?? '0',
        );
        const memPercent = parseFloat(
          raw['MemPerc'] ?? raw['mem_percent'] ?? '0',
        );

        const memUsage = raw['MemUsage'] ?? raw['mem_usage'] ?? '0B / 0B';
        const [memUsedStr, memTotalStr] = memUsage
          .split('/')
          .map((s) => s.trim());
        const memUsedMb = toMb(parseBytes(memUsedStr ?? '0'));
        const memTotalMb = toMb(parseBytes(memTotalStr ?? '0'));

        stats.push({
          name,
          label,
          cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
          memUsedMb,
          memTotalMb,
          memPercent: Number.isFinite(memPercent) ? memPercent : 0,
        });
      }

      return stats;
    } catch (err: unknown) {
      this.logger.warn(
        `docker stats failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /**
   * `docker ps -a`로 컨테이너 가동 상태/업타임/헬스를 조회한다.
   * 중지된(exited) 컨테이너도 포함되므로 "현황" 표시에 적합.
   */
  async getContainerStatuses(): Promise<ContainerStatus[]> {
    try {
      const { stdout } = await execFileAsync(
        'docker',
        ['ps', '-a', '--format', '{{json .}}'],
        { timeout: 10000 },
      );

      const result: ContainerStatus[] = [];

      for (const line of stdout.trim().split('\n')) {
        if (!line.trim()) continue;
        let raw: Record<string, string>;
        try {
          raw = JSON.parse(line) as Record<string, string>;
        } catch {
          continue;
        }

        const name = (raw['Names'] ?? raw['names'] ?? '').replace(/^\//, '');
        const label = CONTAINER_LABELS[name];
        if (!label) continue;

        const status = raw['Status'] ?? raw['status'] ?? '';
        const state = (raw['State'] ?? raw['state'] ?? '').toLowerCase();
        const healthMatch =
          /\((?:health: )?(healthy|unhealthy|starting)\)/i.exec(status);

        result.push({
          name,
          label,
          state,
          status,
          health: healthMatch ? healthMatch[1].toLowerCase() : '',
        });
      }

      return result;
    } catch (err: unknown) {
      this.logger.warn(
        `docker ps failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  @Cron('0 */5 * * * *')
  async saveContainerStats(): Promise<void> {
    try {
      const stats = await this.getContainerStats();
      for (const stat of stats) {
        const container = stat.label as ContainerName;
        if (!VALID_CONTAINERS.includes(container)) continue;
        await this.monitoringRepo.saveDockerMetric(container, {
          cpuPercent: stat.cpuPercent,
          memUsedMb: stat.memUsedMb,
          memTotalMb: stat.memTotalMb,
          memPercent: stat.memPercent,
        });
      }
    } catch (err: unknown) {
      this.logger.warn(
        `docker stats save failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Cron('0 30 3 * * *')
  async cleanupContainerMetrics(): Promise<void> {
    try {
      for (const container of VALID_CONTAINERS) {
        await this.monitoringRepo.deleteDockerMetricsOlderThan(container, 9);
      }
    } catch (err: unknown) {
      this.logger.warn(
        `docker metrics cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getHostStats(): Promise<HostStats | null> {
    try {
      const [mem, cpuPercent, disk] = await Promise.all([
        this.readHostMemory(),
        this.readHostCpu(),
        this.readDiskUsage(),
      ]);
      if (!mem || !disk) return null;
      return {
        cpuPercent: cpuPercent ?? 0,
        memUsedMb: mem.usedMb,
        memTotalMb: mem.totalMb,
        memPercent: mem.percent,
        diskUsedGb: disk.usedGb,
        diskTotalGb: disk.totalGb,
        diskPercent: disk.percent,
      };
    } catch {
      return null;
    }
  }

  private async readHostMemory(): Promise<{
    usedMb: number;
    totalMb: number;
    percent: number;
  } | null> {
    try {
      const text = await readFile('/proc/meminfo', 'utf8');
      const totalKb = Number(/MemTotal:\s+(\d+)/.exec(text)?.[1] ?? 0);
      const availKb = Number(/MemAvailable:\s+(\d+)/.exec(text)?.[1] ?? 0);
      if (totalKb <= 0) return null;
      const usedKb = totalKb - availKb;
      return {
        totalMb: Math.round(totalKb / 1024),
        usedMb: Math.round(usedKb / 1024),
        percent: Number(((usedKb / totalKb) * 100).toFixed(1)),
      };
    } catch {
      return null;
    }
  }

  private async readHostCpu(): Promise<number | null> {
    try {
      const sample = async () => {
        const text = await readFile('/proc/stat', 'utf8');
        const line = text.split('\n')[0];
        const parts = line.trim().split(/\s+/).slice(1).map(Number);
        const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
        const total = parts.reduce((a, b) => a + b, 0);
        return { idle, total };
      };
      const a = await sample();
      await new Promise((r) => setTimeout(r, 200));
      const b = await sample();
      const idleDelta = b.idle - a.idle;
      const totalDelta = b.total - a.total;
      if (totalDelta <= 0) return null;
      return Number((100 * (1 - idleDelta / totalDelta)).toFixed(1));
    } catch {
      return null;
    }
  }

  private async readDiskUsage(): Promise<{
    usedGb: number;
    totalGb: number;
    percent: number;
  } | null> {
    try {
      const { stdout } = await execFileAsync('df', ['/'], { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      const parts = lines[1]?.trim().split(/\s+/);
      if (!parts || parts.length < 5) return null;
      const totalKb = parseInt(parts[1] ?? '0', 10);
      const usedKb = parseInt(parts[2] ?? '0', 10);
      const percent = parseInt((parts[4] ?? '0%').replace('%', ''), 10);
      return {
        totalGb: Number((totalKb / 1024 / 1024).toFixed(1)),
        usedGb: Number((usedKb / 1024 / 1024).toFixed(1)),
        percent: Number.isFinite(percent) ? percent : 0,
      };
    } catch {
      return null;
    }
  }

  async getContainerHistory(
    container: string,
  ): Promise<ContainerHistoryPoint[]> {
    const safe = VALID_CONTAINERS.includes(container as ContainerName)
      ? (container as ContainerName)
      : 'nest';
    const rows = await this.monitoringRepo.findDockerMetricSeries(safe, 7);
    return rows.map((row: ContainerHistoryRow) => ({
      bucket: row.bucket,
      avgCpu: Number(row.avg_cpu),
      avgMem: Number(row.avg_mem),
      avgMemUsedMb: Number(row.avg_mem_used_mb),
    }));
  }
}
