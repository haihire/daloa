import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    host: "https://www.lomoa.kr",
    rules: [
      {
        userAgent: "Mediapartners-Google",
        disallow: "",
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
