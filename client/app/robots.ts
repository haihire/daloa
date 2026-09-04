import type { MetadataRoute } from "next";

// output: "export" 에서는 메타데이터 라우트도 빌드 시점에 확정돼야 한다.
// (sitemap의 new Date()처럼 요청 시점에 달라질 수 있는 값이 있으면 동적으로 분류된다)
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    host: "https://www.lomoa.kr",
    rules: [
      // 광고 크롤러는 "전체 허용"을 반드시 명시적 규칙(Allow)으로 적어야 한다.
      // 예전엔 disallow: "" 로 뒀는데, Next가 빈 문자열이면 Disallow 줄 자체를 생략해
      // 규칙이 하나도 없는 그룹이 만들어졌다. robots.txt 표준(RFC 9309)은 빈 줄을 무시하고
      // 규칙 없이 연속된 User-agent 줄을 한 그룹으로 묶으므로, 이 빈 그룹이 바로 아래
      // Wget 그룹과 합쳐져 "Disallow: /"를 같이 뒤집어썼다 → 애드센스 크롤러 전면 차단.
      // (2026-08-23 애드센스 1차 심사 거절 원인)
      {
        userAgent: "Mediapartners-Google",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      // AdsBot 계열은 User-agent: * 를 따르지 않는다. 원래도 허용이지만 의도를 명시해
      // 위와 같은 사고가 다시 나지 않게 한다.
      {
        userAgent: "AdsBot-Google",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: "Wget",
        disallow: "/",
      },
      {
        userAgent: "*",
        // 실제 라우트는 /admin/* 이다(app/admin/**). 과거 "/common/admin/"으로 적혀 있어
        // 어디에도 매칭되지 않았고 admin이 색인 대상으로 열려 있었다.
        // 주의: 이 차단은 "검색 색인"만 막는다. 포트폴리오용 게스트 로그인 열람은
        // 직접 링크로 접속하는 것이라 그대로 동작한다.
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://www.lomoa.kr/sitemap.xml",
  };
}
