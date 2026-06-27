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

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        `Chzzk 인증정보 미설정: clientId=${this.clientId ? '***' : 'EMPTY'}, secret=${this.clientSecret ? '***' : 'EMPTY'}`,
      );
    }

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
          categoryId: 'Lost_Ark', // 로스트아크 카테고리 필터
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

      // 응답 필터링: liveCategory가 Lost_Ark인 경우만 (추가 안전장치)
      return response.data.content.data
        .filter((item) => item.liveCategory === 'Lost_Ark' || item.liveCategoryValue === '로스트아크')
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

  /**
   * 카테고리 검색 (로아 categoryId 획득 등)
   * @param query 검색어 (예: "로스트아크")
   * @param limit 조회할 카테고리 수
   */
  async searchCategories(
    query: string,
    limit = 20,
  ): Promise<Array<{ categoryId: string; categoryName: string }>> {
    try {
      const response = await this.http.get<{
        code: number;
        content?: {
          categories?: Array<{
            categoryId: string;
            categoryName?: string;
            categoryValue?: string;
          }>;
        };
      }>('/open/v1/categories/search', {
        params: {
          query, // axios가 자동으로 UTF-8 인코딩
          size: limit,
        },
        headers: {
          'Client-Id': this.clientId,
          'Client-Secret': this.clientSecret,
        },
      });

      if (response.data.code !== 200 || !response.data.content?.categories) {
        this.logger.warn(
          `카테고리 검색 실패: code=${response.data.code}`,
        );
        return [];
      }

      return response.data.content.categories.map((cat) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName || cat.categoryValue || '',
      }));
    } catch (error: unknown) {
      this.logger.error(
        `카테고리 검색 API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
