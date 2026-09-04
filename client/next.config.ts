import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages에 정적 파일로 올린다. 전 라우트가 이미 프리렌더라 out/ 에 그대로 떨어진다.
  output: "export",
  // 렌더 차단 CSS(<link>)를 HTML <style>로 인라인 → 크리티컬 요청 체인 단축.
  // 전 페이지가 정적 프리렌더라 인라인 CSS도 HTML과 함께 CDN에 캐시된다.
  experimental: {
    inlineCss: true,
  },
};

export default nextConfig;
