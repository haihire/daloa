import type { MetadataRoute } from "next";

// output: "export" 에서는 메타데이터 라우트도 빌드 시점에 확정돼야 한다.
// (sitemap의 new Date()처럼 요청 시점에 달라질 수 있는 값이 있으면 동적으로 분류된다)
export const dynamic = "force-static";

const SITE_URL = "https://www.lomoa.kr";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    // 문서 페이지는 내용이 거의 바뀌지 않으므로 낮은 우선순위/재크롤 빈도로 둔다.
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
