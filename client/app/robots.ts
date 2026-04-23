import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    host: "https://www.daloa.kr",
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
        disallow: [
          "/api/",
          "/common/admin/",
          "/env/",
          "/staff/",
          "/test/",
          "/search/",
        ],
      },
    ],
    sitemap: "https://www.daloa.kr/sitemap.xml",
  };
}
