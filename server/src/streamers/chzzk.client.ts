import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ChzzkLiveItem {
  platform: 'chzzk';
  channelName: string;
  channelId: string;
  title: string;
  viewerCount: number;
  thumbnailUrl: string;
  liveUrl: string;
  startedAt: Date;
}

@Injectable()
export class ChzzkClient {
  private readonly logger = new Logger(ChzzkClient.name);
  private readonly http: AxiosInstance;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('CHZZK_CLIENT_ID', '');
    this.clientSecret = config.get<string>('CHZZK_CLIENT_SECRET', '');

    this.http = axios.create({
      baseURL: 'https://api.chzzk.naver.com',
      timeout: 10000,
    });
  }

  /**
   * 로아 카테고리 라이브 목록 조회 (Stage A: 스텁)
   *
   * TODO Stage B: 앱 등록 후 체크리스트 4항 실측
   * 1. 인증 헤더 포맷 확정 → 수정
   * 2. `/open/v1/lives` 카테고리 필터 파라미터 지원 여부 확인
   * 3. 실제 응답 스키마 확인 → 필드 매핑 수정
   * 4. 페이지 예산 K 결정 → 상위 K페이지 스캔 로직 구현
   */
  async fetchLivesByCategory(
    _categoryId = 'lostarkvtj',
    _limit = 50,
  ): Promise<ChzzkLiveItem[]> {
    this.logger.debug(
      '[Stage A 스텁] Chzzk API 호출 시뮬레이션 — 빈 배열 반환',
    );
    return [];
  }

  /**
   * 라이브 목록을 시청자수 기준으로 필터링
   */
  filterByViewerCount(
    items: ChzzkLiveItem[],
    minViewers = 0,
  ): ChzzkLiveItem[] {
    return items.filter((item) => item.viewerCount >= minViewers);
  }
}
