/** YouTube API 응답의 quota 관련 에러 형태 (search/videos.list 공통) */
export interface YoutubeApiErrorShape {
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
        errors?: Array<{
          reason?: string;
        }>;
      };
    };
  };
}

export function toYoutubeApiError(error: unknown): YoutubeApiErrorShape {
  if (typeof error === 'object' && error !== null) {
    return error as YoutubeApiErrorShape;
  }
  return {};
}

/** YouTube 할당량 리셋까지 남은 초 (매일 오후 4시 KST = 07:00 UTC) */
export function secondsUntilQuotaReset(): number {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(7, 0, 0, 0);
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return Math.ceil((reset.getTime() - now.getTime()) / 1000);
}
