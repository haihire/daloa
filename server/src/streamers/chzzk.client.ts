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
      baseURL: 'https://openapi.chzzk.naver.com',
      timeout: 10000,
    });
  }

  /**
   * 로아 카테고리 라이브 목록 조회
   * @param categoryId 로아 카테고리 ID (기본: 'lostarkvtj')
   * @param limit 조회할 라이브 수
   */
  async fetchLivesByCategory(
    categoryId = 'lostarkvtj',
    limit = 50,
  ): Promise<ChzzkLiveItem[]> {
    try {
      // Chzzk 공식 API: GET /open/v1/lives
      // 호스트: https://openapi.chzzk.naver.com
      // 인증: Client-Id, Client-Secret 헤더
      const response = await this.http.get<{
        code: number;
        message?: string;
        content?: {
          data?: Array<{
            liveId: string;
            liveTitle: string;
            liveCategory?: string;
            liveCategoryValue?: string;
            channel: {
              channelId: string;
              channelName: string;
            };
            liveImageUrl?: string;
            defaultThumbnailImageUrl?: string;
            concurrentUserCount: number;
            openDate: string;
          }>;
          page?: {
            next?: string;
          };
        };
      }>('/open/v1/lives', {
        params: {
          size: limit,
          sortType: 'POPULAR',
          // 카테고리 필터 파라미터 (API가 지원하는지는 실측 필요)
          // categoryId 와 liveCategory 중 실제 파라미터명은 응답으로 확인
        },
        headers: {
          'Client-Id': this.clientId,
          'Client-Secret': this.clientSecret,
        },
      });

      if (response.data.code !== 200 || !response.data.content?.data) {
        this.logger.warn(
          `Chzzk API 응답 실패: code=${response.data.code}, message=${response.data.message}`,
        );
        return [];
      }

      // 응답 필드명 확인 후 필터링 (로아 카테고리만)
      return response.data.content.data
        .filter((item) => {
          const cat =
            item.liveCategory || item.liveCategoryValue || '';
          // 실측 결과에 따라 필터링 로직 조정 필요
          return cat.toLowerCase().includes('lost ark') ||
            cat.toLowerCase().includes('로스트아크') ||
            item.liveTitle.toLowerCase().includes('lost ark') ||
            item.liveTitle.includes('로스트아크');
        })
        .map((item) => ({
          platform: 'chzzk' as const,
          channelId: item.channel.channelId,
          channelName: item.channel.channelName,
          title: item.liveTitle,
          viewerCount: item.concurrentUserCount,
          thumbnailUrl:
            item.liveImageUrl || item.defaultThumbnailImageUrl || '',
          liveUrl: `https://chzzk.naver.com/live/${item.channel.channelId}`,
          startedAt: new Date(item.openDate),
        }));
    } catch (error: unknown) {
      this.logger.error(
        `Chzzk API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
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
