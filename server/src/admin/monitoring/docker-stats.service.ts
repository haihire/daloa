import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { readFile, readdir } from 'fs/promises';
import { cpus } from 'os';
import { promisify } from 'util';
import type { Redis } from 'ioredis';
import { runIfLockAcquired } from '../../common/cron-lock.util';
import { REDIS_CLIENT } from '../../redis/redis.module';
import {
  MonitoringRepository,
  ContainerName,
  ContainerHistoryRow,
  ResourceBreakdownHistoryRow,
} from './monitoring.repository';

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

/**
 * EC2 호스트 전체 자원을 "4개 컨테이너 / 도커 데몬 자체(dockerd·containerd 등) /
 * 그 나머지(OS·커널·기타 프로세스)"로 쪼갠 값. cpuPercent는 모두 호스트 전체 용량
 * 기준 0~100 스케일로 정규화되어 있어 그대로 합산·적층(stack)해서 표시할 수 있다.
 */
export interface ResourceBreakdown {
  hostCpuPercent: number;
  hostMemUsedMb: number;
  hostMemTotalMb: number;
  containers: Array<{
    label: string;
    cpuPercent: number;
    memUsedMb: number;
    diskUsedMb: number;
  }>;
  dockerOverheadCpuPercent: number;
  dockerOverheadMemMb: number;
  dockerOverheadDiskMb: number;
  osOtherCpuPercent: number;
  osOtherMemMb: number;
  osOtherDiskMb: number;
}

export interface ResourceBreakdownHistoryPoint {
  bucket: string;
  nestCpu: number;
  nestMemMb: number;
  nginxCpu: number;
  nginxMemMb: number;
  redisCpu: number;
  redisMemMb: number;
  postgresCpu: number;
  postgresMemMb: number;
  dockerOverheadCpu: number;
  dockerOverheadMemMb: number;
  osOtherCpu: number;
  osOtherMemMb: number;
  hostCpu: number;
  hostMemMb: number;
  hostMemTotalMb: number;
}

// comm은 커널이 15자로 자르므로(예: containerd-shim-runc-v2 → containerd-shim) 자른 후 형태로 매칭.
const DOCKER_DAEMON_PROCESS_NAMES = new Set([
  'dockerd',
  'containerd',
  'containerd-shim',
  'docker-proxy',
  'docker-init',
]);

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

/** breakdown.containers 배열(존재하는 컨테이너만)을 4개 고정 컨테이너 레코드로 — 죽은 컨테이너는 0으로 채운다. */
function containersToRecord(
  containers: ResourceBreakdown['containers'],
): Record<ContainerName, { cpuPercent: number; memUsedMb: number }> {
  const base: Record<ContainerName, { cpuPercent: number; memUsedMb: number }> =
    {
      nest: { cpuPercent: 0, memUsedMb: 0 },
      nginx: { cpuPercent: 0, memUsedMb: 0 },
      redis: { cpuPercent: 0, memUsedMb: 0 },
      postgres: { cpuPercent: 0, memUsedMb: 0 },
    };
  for (const c of containers) {
    if (VALID_CONTAINERS.includes(c.label as ContainerName)) {
      base[c.label as ContainerName] = {
        cpuPercent: c.cpuPercent,
        memUsedMb: c.memUsedMb,
      };
    }
  }
  return base;
}

@Injectable()
export class DockerStatsService {
  private readonly logger = new Logger(DockerStatsService.name);

  constructor(
    private readonly monitoringRepo: MonitoringRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

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
    await runIfLockAcquired(this.redis, 'saveContainerStats', async () => {
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

        const breakdown = await this.computeResourceBreakdown(stats);
        if (breakdown) {
          await this.monitoringRepo.saveResourceBreakdown({
            containers: containersToRecord(breakdown.containers),
            dockerOverheadCpuPercent: breakdown.dockerOverheadCpuPercent,
            dockerOverheadMemMb: breakdown.dockerOverheadMemMb,
            osOtherCpuPercent: breakdown.osOtherCpuPercent,
            osOtherMemMb: breakdown.osOtherMemMb,
            hostCpuPercent: breakdown.hostCpuPercent,
            hostMemUsedMb: breakdown.hostMemUsedMb,
            hostMemTotalMb: breakdown.hostMemTotalMb,
          });
        }
      } catch (err: unknown) {
        this.logger.warn(
          `docker stats save failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  @Cron('0 30 3 * * *')
  async cleanupContainerMetrics(): Promise<void> {
    await runIfLockAcquired(this.redis, 'cleanupContainerMetrics', async () => {
      try {
        for (const container of VALID_CONTAINERS) {
          await this.monitoringRepo.deleteDockerMetricsOlderThan(container, 9);
        }
        await this.monitoringRepo.deleteResourceBreakdownOlderThan(9);
      } catch (err: unknown) {
        this.logger.warn(
          `docker metrics cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
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

  /**
   * 호스트 CPU% 단독 측정(AI 진단·RAG 스냅샷용). 컨테이너 현황 API는 자원 분해 쪽 값을 쓴다.
   * 측정 창은 아래 sampleHostAndDaemonCpu·`docker stats`와 같은 1초로 맞춘다 — 200ms로 짧게 두면
   * 컨테이너 쪽에서 잡힌 스파이크를 이 창이 비껴가, 호스트 총합이 컨테이너 합보다 작게 나온다.
   */
  private async readHostCpu(): Promise<number | null> {
    try {
      const a = await this.sampleSystemTicks();
      await new Promise((r) => setTimeout(r, 1000));
      const b = await this.sampleSystemTicks();
      const idleDelta = b.idle - a.idle;
      const totalDelta = b.total - a.total;
      if (totalDelta <= 0) return null;
      return Number((100 * (1 - idleDelta / totalDelta)).toFixed(1));
    } catch {
      return null;
    }
  }

  private async sampleSystemTicks(): Promise<{ idle: number; total: number }> {
    const text = await readFile('/proc/stat', 'utf8');
    const line = text.split('\n')[0];
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  }

  /** /proc를 뒤져 dockerd/containerd 계열 프로세스의 PID를 찾는다 (컨테이너 자체가 아닌, 도커를 돌리는 데몬). */
  private async listDockerDaemonPids(): Promise<number[]> {
    let entries: string[];
    try {
      entries = await readdir('/proc');
    } catch {
      return [];
    }
    const pids = entries.filter((e) => /^\d+$/.test(e));
    const matched: number[] = [];
    await Promise.all(
      pids.map(async (pidStr) => {
        try {
          const comm = (await readFile(`/proc/${pidStr}/comm`, 'utf8')).trim();
          if (DOCKER_DAEMON_PROCESS_NAMES.has(comm)) {
            matched.push(Number(pidStr));
          }
        } catch {
          // 샘플링 사이 종료된 프로세스이거나 권한 문제 — 무시
        }
      }),
    );
    return matched;
  }

  /** 주어진 PID들의 누적 CPU 틱(utime+stime)을 읽는다. /proc/stat의 total 델타와 같은 단위라 그대로 비율 계산에 쓸 수 있다. */
  private async sampleProcessCpuTicks(
    pids: number[],
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    await Promise.all(
      pids.map(async (pid) => {
        try {
          const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
          // comm이 괄호 안에 공백/괄호를 포함할 수 있어 마지막 ')' 뒤부터 필드를 센다.
          const closeParen = stat.lastIndexOf(')');
          if (closeParen === -1) return;
          const rest = stat
            .slice(closeParen + 2)
            .trim()
            .split(/\s+/);
          const utime = Number(rest[11] ?? 0); // 14번째 필드
          const stime = Number(rest[12] ?? 0); // 15번째 필드
          result.set(pid, utime + stime);
        } catch {
          // 샘플링 사이 종료된 프로세스 — 무시
        }
      }),
    );
    return result;
  }

  /** 주어진 PID들의 실제 상주 메모리(RSS) 합계(MB). */
  private async readProcessGroupRssMb(pids: number[]): Promise<number> {
    let totalKb = 0;
    await Promise.all(
      pids.map(async (pid) => {
        try {
          const status = await readFile(`/proc/${pid}/status`, 'utf8');
          const match = /VmRSS:\s+(\d+)\s*kB/.exec(status);
          if (match) totalKb += Number(match[1]);
        } catch {
          // 무시
        }
      }),
    );
    return Math.round(totalKb / 1024);
  }

  /**
   * 같은 샘플링 구간에서 호스트 전체 CPU%와 도커 데몬 프로세스 CPU%를 함께 측정(비교 기준 일치).
   * `docker stats`는 자체적으로 약 1초 창으로 컨테이너 CPU%를 계산하는데, 여기를 200ms로 너무 짧게
   * 잡으면 유휴 상태에서 컨테이너 쪽에 잠깐 튄 값이 이 호스트 총합보다 커 보여서(측정 창이 서로
   * 달라 생기는 노이즈) "기타(OS)"가 뺄셈에서 항상 음수→0으로 눌리는 문제가 있었다. 1초로 맞춘다.
   */
  private async sampleHostAndDaemonCpu(
    daemonPids: number[],
  ): Promise<{ hostCpuPercent: number; daemonCpuPercent: number } | null> {
    try {
      const [sysA, ticksA] = await Promise.all([
        this.sampleSystemTicks(),
        this.sampleProcessCpuTicks(daemonPids),
      ]);
      await new Promise((r) => setTimeout(r, 1000));
      const [sysB, ticksB] = await Promise.all([
        this.sampleSystemTicks(),
        this.sampleProcessCpuTicks(daemonPids),
      ]);

      const totalDelta = sysB.total - sysA.total;
      if (totalDelta <= 0) return null;

      const idleDelta = sysB.idle - sysA.idle;
      const hostCpuPercent = Number(
        (100 * (1 - idleDelta / totalDelta)).toFixed(2),
      );

      let daemonTicksDelta = 0;
      for (const pid of daemonPids) {
        const delta = (ticksB.get(pid) ?? 0) - (ticksA.get(pid) ?? 0);
        if (delta > 0) daemonTicksDelta += delta;
      }
      const daemonCpuPercent = Number(
        ((daemonTicksDelta / totalDelta) * 100).toFixed(2),
      );

      return { hostCpuPercent, daemonCpuPercent };
    } catch {
      return null;
    }
  }

  /**
   * `docker system df -v`로 컨테이너별 디스크 사용량(쓰기 레이어 + 그 컨테이너가 마운트한
   * 네임드 볼륨)과 도커 이미지·빌드캐시 총량을 구한다. postgres처럼 실데이터가 네임드
   * 볼륨에 있는 경우 쓰기 레이어만 보면 몇 KB로 보여 오해를 주므로 볼륨을 반드시 더한다.
   */
  private async computeDiskUsage(): Promise<{
    containers: Array<{ label: string; diskUsedMb: number }>;
    dockerMb: number;
  } | null> {
    try {
      const { stdout } = await execFileAsync(
        'docker',
        ['system', 'df', '-v', '--format', '{{json .}}'],
        { timeout: 15000 },
      );
      const parsed = JSON.parse(stdout) as {
        Images?: Array<{ Size?: string }>;
        Containers?: Array<{ Names?: string; Size?: string; Mounts?: string }>;
        Volumes?: Array<{ Name?: string; Size?: string }>;
        BuildCache?: Array<{ Size?: string }>;
      };

      const volumeMb = new Map<string, number>();
      for (const v of parsed.Volumes ?? []) {
        if (v.Name) volumeMb.set(v.Name, toMb(parseBytes(v.Size ?? '0B')));
      }

      const containers: Array<{ label: string; diskUsedMb: number }> = [];
      for (const c of parsed.Containers ?? []) {
        const name = (c.Names ?? '').replace(/^\//, '');
        const label = CONTAINER_LABELS[name];
        if (!label) continue;
        let diskMb = toMb(parseBytes(c.Size ?? '0B'));
        for (const mountName of (c.Mounts ?? '')
          .split(',')
          .map((s) => s.trim())) {
          const vol = volumeMb.get(mountName);
          if (vol) diskMb += vol;
        }
        containers.push({ label, diskUsedMb: Number(diskMb.toFixed(1)) });
      }

      const imagesMb = (parsed.Images ?? []).reduce(
        (sum, img) => sum + toMb(parseBytes(img.Size ?? '0B')),
        0,
      );
      const buildCacheMb = (parsed.BuildCache ?? []).reduce(
        (sum, b) => sum + toMb(parseBytes(b.Size ?? '0B')),
        0,
      );

      return {
        containers,
        dockerMb: Number((imagesMb + buildCacheMb).toFixed(1)),
      };
    } catch (err: unknown) {
      this.logger.warn(
        `disk usage breakdown failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private diskUsageCache: {
    data: Awaited<ReturnType<DockerStatsService['computeDiskUsage']>>;
    expiresAt: number;
  } | null = null;
  private static readonly DISK_USAGE_CACHE_MS = 60_000;

  /**
   * `docker system df -v` 자체가 이미지 레이어를 훑느라 dockerd/containerd에 실제 CPU
   * 부하를 준다(실측: 1회 호출에 dockerd+containerd 합쳐 약 50틱, 1초·2코어 총량의 ~25%).
   * 매 라이브 폴링(10초)마다 이걸 다시 돌리면 그 부하 자체가 "도커 자체 CPU"로 잘못
   * 잡히고, 안 그래도 잘 안 바뀌는 디스크 크기를 불필요하게 자주 재계산하는 낭비도 있어
   * 60초 캐시한다.
   */
  private async getDiskUsageCached(): Promise<
    Awaited<ReturnType<DockerStatsService['computeDiskUsage']>>
  > {
    const now = Date.now();
    if (this.diskUsageCache && this.diskUsageCache.expiresAt > now) {
      return this.diskUsageCache.data;
    }
    const data = await this.computeDiskUsage();
    this.diskUsageCache = {
      data,
      expiresAt: now + DockerStatsService.DISK_USAGE_CACHE_MS,
    };
    return data;
  }

  /**
   * 호스트 전체 자원을 컨테이너별/도커 데몬/그 나머지(OS 등)로 분해한다.
   * containers는 이미 `docker stats`로 얻은 값을 넘겨받아 재사용 — cron·API 양쪽에서 중복 호출을 피한다.
   */
  private async computeResourceBreakdown(
    containers: ContainerStat[],
  ): Promise<ResourceBreakdown | null> {
    try {
      const daemonPids = await this.listDockerDaemonPids();
      // 디스크 조회(docker system df -v)는 dockerd에 실제 부하를 주므로, CPU 샘플링
      // 구간과 겹치지 않도록 CPU 측정이 끝난 뒤에 순차로 실행한다(위 getDiskUsageCached 참고).
      const [cpu, mem, daemonMemMb, hostDisk] = await Promise.all([
        this.sampleHostAndDaemonCpu(daemonPids),
        this.readHostMemory(),
        this.readProcessGroupRssMb(daemonPids),
        this.readDiskUsage(),
      ]);
      if (!cpu || !mem) return null;
      const disk = await this.getDiskUsageCached();

      // docker stats의 CPU%는 코어 1개 기준(최대 100*코어수)이라, 호스트 전체 대비 비율로 맞추려면 코어 수로 나눠야 한다.
      const numCpus = Math.max(1, cpus().length);
      const diskByLabel = new Map(
        (disk?.containers ?? []).map((c) => [c.label, c.diskUsedMb]),
      );
      const normalizedContainers = containers.map((c) => ({
        label: c.label,
        cpuPercent: Number((c.cpuPercent / numCpus).toFixed(2)),
        memUsedMb: c.memUsedMb,
        diskUsedMb: diskByLabel.get(c.label) ?? 0,
      }));
      const containerCpuSum = normalizedContainers.reduce(
        (sum, c) => sum + c.cpuPercent,
        0,
      );
      const containerMemSum = normalizedContainers.reduce(
        (sum, c) => sum + c.memUsedMb,
        0,
      );
      const containerDiskSum = normalizedContainers.reduce(
        (sum, c) => sum + c.diskUsedMb,
        0,
      );

      const osOtherCpuPercent = Math.max(
        0,
        Number(
          (cpu.hostCpuPercent - containerCpuSum - cpu.daemonCpuPercent).toFixed(
            2,
          ),
        ),
      );
      const osOtherMemMb = Math.max(
        0,
        Math.round(mem.usedMb - containerMemSum - daemonMemMb),
      );
      // df(1)의 GB는 실제로 1024진 GiB — 도커 쪽 크기(1000진 decimal MB)와 완전히 같은
      // 잣대는 아니지만, 이 정도 근사는 대시보드 표시용으로는 충분하다.
      const dockerOverheadDiskMb = disk?.dockerMb ?? 0;
      const osOtherDiskMb = hostDisk
        ? Math.max(
            0,
            Math.round(
              hostDisk.usedGb * 1024 - containerDiskSum - dockerOverheadDiskMb,
            ),
          )
        : 0;

      return {
        hostCpuPercent: cpu.hostCpuPercent,
        hostMemUsedMb: mem.usedMb,
        hostMemTotalMb: mem.totalMb,
        containers: normalizedContainers,
        dockerOverheadCpuPercent: cpu.daemonCpuPercent,
        dockerOverheadMemMb: daemonMemMb,
        dockerOverheadDiskMb,
        osOtherCpuPercent,
        osOtherMemMb,
        osOtherDiskMb,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `resource breakdown failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async getResourceBreakdown(): Promise<ResourceBreakdown | null> {
    const containers = await this.getContainerStats();
    return this.computeResourceBreakdown(containers);
  }

  /**
   * 자원 추세 조회 구간을 정한다.
   *  - from/to=YYYY-MM-DD → 그 기간(KST 기준, to는 그 날 끝까지 포함)
   *  - 그 외              → 최근 N일(days, 기본 7, 보관기간인 9일까지)
   * 하루 이하 구간은 10분 버킷 + 'HH24:MI' 라벨. 'MM-DD HH24:MI'는 날짜가 바뀌는
   * 지점에만 라벨이 붙는 규칙이라 하루짜리 구간에서는 X축 눈금이 거의 안 보인다.
   */
  private resolveHistoryRange(opts?: {
    days?: string;
    from?: string;
    to?: string;
  }): {
    from: Date;
    to: Date;
    bucketSeconds: number;
    labelFormat: string;
  } {
    const dayMs = 24 * 60 * 60 * 1000;
    const kstDay = (v: string | undefined): Date | null => {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const d = new Date(`${v}T00:00:00+09:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const fromDay = kstDay(opts?.from);
    const toDay = kstDay(opts?.to);
    if (fromDay && toDay) {
      // 순서가 뒤집혀 와도 그대로 쓰면 빈 구간이 되므로 정렬한다.
      const start = fromDay <= toDay ? fromDay : toDay;
      const endDay = fromDay <= toDay ? toDay : fromDay;
      const end = new Date(endDay.getTime() + dayMs); // to 당일 끝까지 포함
      const spanDays = (end.getTime() - start.getTime()) / dayMs;
      return {
        from: start,
        to: end,
        bucketSeconds: spanDays <= 1 ? 600 : 3600,
        labelFormat: spanDays <= 1 ? 'HH24:MI' : 'MM-DD HH24:MI',
      };
    }

    const parsed = Number(opts?.days);
    const days = Number.isFinite(parsed)
      ? Math.max(1, Math.min(9, Math.trunc(parsed)))
      : 7;
    const to = new Date();
    if (days <= 1) {
      // "24시간"은 말 그대로 지금부터 거슬러 24시간(롤링).
      return {
        from: new Date(to.getTime() - dayMs),
        to,
        bucketSeconds: 600,
        labelFormat: 'HH24:MI',
      };
    }
    // "N일"은 오늘 포함 N개 날짜 — KST 자정에 맞춰 자른다. 그래야 하루 경계가 버킷
    // 경계와 딱 맞아 X축에 날짜가 하루에 하나씩 찍힌다(지금 시각 기준으로 자르면
    // 첫 날이 반토막 나고 경계가 어긋난다).
    const kstNow = new Date(to.getTime() + 9 * 3600 * 1000);
    const kstMidnightUtcMs =
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate(),
      ) -
      9 * 3600 * 1000;
    return {
      from: new Date(kstMidnightUtcMs - (days - 1) * dayMs),
      to,
      bucketSeconds: 3600,
      labelFormat: 'MM-DD HH24:MI',
    };
  }

  async getResourceBreakdownHistory(opts?: {
    days?: string;
    from?: string;
    to?: string;
  }): Promise<ResourceBreakdownHistoryPoint[]> {
    const rows = await this.monitoringRepo.findResourceBreakdownSeries(
      this.resolveHistoryRange(opts),
    );
    return rows.map((row: ResourceBreakdownHistoryRow) => ({
      bucket: row.bucket,
      nestCpu: Number(row.avg_nest_cpu),
      nestMemMb: Number(row.avg_nest_mem_mb),
      nginxCpu: Number(row.avg_nginx_cpu),
      nginxMemMb: Number(row.avg_nginx_mem_mb),
      redisCpu: Number(row.avg_redis_cpu),
      redisMemMb: Number(row.avg_redis_mem_mb),
      postgresCpu: Number(row.avg_postgres_cpu),
      postgresMemMb: Number(row.avg_postgres_mem_mb),
      dockerOverheadCpu: Number(row.avg_docker_overhead_cpu),
      dockerOverheadMemMb: Number(row.avg_docker_overhead_mem_mb),
      osOtherCpu: Number(row.avg_os_other_cpu),
      osOtherMemMb: Number(row.avg_os_other_mem_mb),
      hostCpu: Number(row.avg_host_cpu),
      hostMemMb: Number(row.avg_host_mem_mb),
      hostMemTotalMb: Number(row.avg_host_mem_total_mb),
    }));
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
