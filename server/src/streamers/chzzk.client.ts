import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// 이름과 달리 Chzzk 전용이 아니다 — YouTube 라이브(youtube-live.service.ts)도 이 형태를
// 그대로 재사용한다. platform 필드로 두 플랫폼을 구분한다.
export interface LiveItem {
  platform: 'chzzk' | 'youtube';
  channelName: string;
  channelId: string;
  title: string;
  viewerCount: number;
  thumbnailUrl: string;
  channelImageUrl?: string;
  liveUrl: string;
  startedAt: Date;
}

// Chzzk API 응답 타입
interface ChzzkLiveRawItem {
  liveId: string;
  liveTitle: string;
  liveCategory?: string;
  liveCategoryValue?: string;
  channelId: string;
  channelName: string;
  channelImageUrl?: string;
  liveThumbnailImageUrl?: string;
  concurrentUserCount: number;
  openDate: string;
}

interface ChzzkLiveResponse {
  code: number;
  message?: string;
  content?: {
    data?: ChzzkLiveRawItem[];
    page?: {
      next?: string;
    };
  };
}

interface ChzzkCategoryResponse {
  code: number;
  content?: {
    categories?: Array<{
      categoryId: string;
      categoryName?: string;
      categoryValue?: string;
    }>;
  };
}

@Injectable()
export class ChzzkClient {
  private readonly logger = new Logger(ChzzkClient.name);
  private readonly http: AxiosInstance;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly thumbnailResolution: string;
  private readonly livePageSize: number;
  private readonly kBudget: number;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('CHZZK_CLIENT_ID', '');
    this.clientSecret = config.get<string>('CHZZK_CLIENT_SECRET', '');
    this.thumbnailResolution = config.get<string>(
      'CHZZK_THUMBNAIL_RESOLUTION',
      '480',
    );
    this.livePageSize = config.get<number>('CHZZK_LIVE_PAGE_SIZE', 20);
    this.kBudget = config.get<number>('CHZZK_LIVE_K_BUDGET', 2);

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
   * 로스트아크 라이브 목록 조회
   * @description Chzzk Open API /open/v1/lives에서 라이브를 조회.
   * API 응답에서 liveCategoryValue === '로스트아크' 필터링 후 반환.
   * 카테고리/개수는 Lost_Ark 고정 + CHZZK_LIVE_PAGE_SIZE env 사용(인자 없음).
   * @returns 로스트아크 라이브 목록 (빈 배열도 정상)
   */
  async fetchLivesByCategory(): Promise<LiveItem[]> {
    try {
      const allLives: ChzzkLiveRawItem[] = [];
      let nextToken: string | undefined;
      let pageCount = 0;
      const pageSize = Math.min(this.livePageSize, 20); // API 최대값 20

      // K 예산만큼 페이지 스캔
      for (let i = 0; i < this.kBudget; i++) {
        // 모든 페이지: next 토큰을 쿼리 파라미터로 전달
        const response = await this.http.get<ChzzkLiveResponse>(
          '/open/v1/lives',
          {
            params: {
              size: pageSize,
              sortType: 'POPULAR',
              ...(nextToken ? { next: nextToken } : {}),
            },
            headers: {
              'Client-Id': this.clientId,
              'Client-Secret': this.clientSecret,
            },
          },
        );

        if (response.data.code !== 200 || !response.data.content?.data) {
          this.logger.warn(
            `Chzzk API 응답 실패 (페이지 ${pageCount + 1}): code=${response.data.code}`,
          );
          break;
        }

        const pageData = response.data.content.data;
        allLives.push(...pageData);
        pageCount++;

        this.logger.debug(
          `Chzzk API 페이지 ${pageCount}: ${pageData.length}개 추가 (합계 ${allLives.length}개)`,
        );

        // 조기종료: 마지막 아이템 시청자 < 10 (인기순이라 이후 로아는 극소)
        const lastItem = pageData[pageData.length - 1];
        if (lastItem?.concurrentUserCount < 10) {
          this.logger.debug(
            `조기종료: 시청자 ${lastItem.concurrentUserCount} < 10 (페이지 ${pageCount})`,
          );
          break;
        }

        nextToken = response.data.content.page?.next;
        if (!nextToken) break;
      }

      // 응답 필터링: 로스트아크만 (정확 일치로 안정성 향상)
      const filtered = allLives
        .filter((item) => item.liveCategoryValue === '로스트아크')
        .map((item) => {
          const raw = item.liveThumbnailImageUrl || '';
          const thumbnailUrl =
            raw && raw.length > 0
              ? raw.replace('{type}', this.thumbnailResolution)
              : '';

          // 첫 아이템만 로그: 썸네일 URL 치환 검증
          if (!this.logger['__logged']) {
            this.logger.debug(
              `썸네일 URL 샘플: raw="${raw.substring(0, 80)}..." → resolved="${thumbnailUrl.substring(0, 80)}..."`,
            );
            this.logger['__logged'] = true;
          }

          return {
            platform: 'chzzk' as const,
            channelId: item.channelId,
            channelName: item.channelName,
            title: item.liveTitle,
            viewerCount: item.concurrentUserCount,
            thumbnailUrl,
            channelImageUrl: item.channelImageUrl,
            liveUrl: `https://chzzk.naver.com/live/${item.channelId}`,
            startedAt: new Date(item.openDate),
          };
        });

      this.logger.debug(
        `Chzzk 스캔 완료: ${pageCount}페이지 ${allLives.length}개 → 필터링 후 ${filtered.length}개 (로스트아크)`,
      );

      return filtered;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const respData = error.response.data as { message?: string } | null;
          this.logger.error(
            `Chzzk API 응답 에러: ${error.response.status} ${error.response.statusText} - ${respData?.message || ''}`,
          );
        } else if (error.request) {
          this.logger.error(`Chzzk API 네트워크 에러: ${error.message}`);
        } else {
          this.logger.error(`Chzzk API 요청 생성 실패: ${error.message}`);
        }
      } else {
        this.logger.error(
          `Chzzk API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return [];
    }
  }

  /**
   * 라이브 목록을 시청자수 기준으로 필터링
   */
  filterByViewerCount(items: LiveItem[], minViewers = 0): LiveItem[] {
    return items.filter((item) => item.viewerCount >= minViewers);
  }

  /**
   * Chzzk 카테고리 검색
   * @description /open/v1/categories/search로 카테고리명 검색.
   * axios params 옵션으로 자동 UTF-8 인코딩됨 (수동 encodeURIComponent 금지).
   * @param query 한글 검색어 (예: "로스트아크") - UTF-8로 자동 인코딩
   * @param limit 결과 개수 (기본 20)
   * @returns categoryId/categoryName 배열
   */
  async searchCategories(
    query: string,
    limit = 20,
  ): Promise<Array<{ categoryId: string; categoryName: string }>> {
    try {
      const response = await this.http.get<ChzzkCategoryResponse>(
        '/open/v1/categories/search',
        {
          params: {
            query, // axios가 자동으로 UTF-8 인코딩
            size: limit,
          },
          headers: {
            'Client-Id': this.clientId,
            'Client-Secret': this.clientSecret,
          },
        },
      );

      if (response.data.code !== 200 || !response.data.content?.categories) {
        this.logger.warn(`카테고리 검색 실패: code=${response.data.code}`);
        return [];
      }

      return response.data.content.categories.map((cat) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName || cat.categoryValue || '',
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          this.logger.error(
            `카테고리 검색 API 응답 에러: ${error.response.status} ${error.response.statusText}`,
          );
        } else if (error.request) {
          this.logger.error(
            `카테고리 검색 API 네트워크 에러: ${error.message}`,
          );
        } else {
          this.logger.error(
            `카테고리 검색 API 요청 생성 실패: ${error.message}`,
          );
        }
      } else {
        this.logger.error(
          `카테고리 검색 API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return [];
    }
  }
}
