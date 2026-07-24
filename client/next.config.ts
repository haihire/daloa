import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 렌더 차단 CSS(<link>)를 HTML <style>로 인라인 → 크리티컬 요청 체인 단축.
  // 정적 ISR HTML이 엣지에 캐시되므로 인라인 CSS도 함께 캐시되어 별도 왕복 제거.
  experimental: {
    inlineCss: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons**",
      },
      {
        protocol: "https",
        hostname: "livecloud-thumb.akamaized.net",
      },
      {
        protocol: "https",
        hostname: "nng-phinf.pstatic.net",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
  // 매칭되는 핸들러가 없는 /api 경로(예: /api/streamers/live)만 Nest 백엔드로 프록시한다.
  // 주의: afterFiles rewrite는 "정적 파일·정적 라우트" 뒤에, 그러나 "동적 라우트([id] 등)"
  // '앞'에 검사된다. 그래서 /api/:path* 로 두면 /api/admin/sites/[id] 같은 동적 route handler가
  // 이 rewrite에 먼저 잡혀 쿠키→x-admin-session 변환 없이 Nest로 프록시되고 "세션이 없습니다"가 뜬다.
  // → 쿠키 인증이 필요한 /api/admin/* 은 negative lookahead로 제외해 항상 route handler를 타게 한다.
  rewrites: async () => ({
    afterFiles: [
      {
        source: "/api/:path((?!admin/).*)",
        destination: `${process.env.NEST_API_URL || "http://localhost:3001"}/api/:path`,
      },
    ],
  }),
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "private-project-l2",

  project: "lomoa-web",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Sentry는 에러 추적 전용 — 성능 트레이싱/Session Replay 미사용.
  // 트레이싱·Replay 코드를 빌드 타임에 트리셰이크하려는 의도.
  // NOTE: Next 16 기본 빌드는 Turbopack이고, 현재 Sentry bundleSizeOptimizations(__SENTRY_TRACING__
  //  치환)는 Turbopack에서 적용되지 않아 사실상 무동작이다(번들 미감소). webpack 빌드로 전환하거나
  //  Sentry의 Turbopack 지원이 추가되면 활성화됨. 클라 트레이싱 차단은 instrumentation-client의
  //  런타임 통합 필터가 담당한다.
  bundleSizeOptimizations: {
    excludeTracing: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
