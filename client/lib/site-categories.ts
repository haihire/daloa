"use client";

import { useEffect, useState } from "react";

// 사이트 카테고리 고정 목록 — 서버 단일 정본(server/src/admin/site-categories.ts)을
// GET /api/admin/sites/categories로 받아온다. DB CHECK 제약(SQL)은 언어가 달라
// 별도 정본으로 남는다: db-migrations/008_loa_sites_category_enum.sql.
// (이전엔 이 파일 자체가 고정 배열을 들고 있어 client/server/DB 3곳이 각각 따로
// 바뀌어야 했다 — server를 단일 정본으로 삼아 client/server 2곳은 합쳤다.)

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

async function fetchCategories(): Promise<string[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/admin/sites/categories", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((data: { categories?: string[] }) => {
        cache = data.categories ?? [];
        return cache;
      })
      .catch(() => [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 사이트 카테고리 고정 목록. 로드 전(첫 렌더)엔 빈 배열 — 로드되면 즉시 채워진다. */
export function useSiteCategories(): string[] {
  const [categories, setCategories] = useState<string[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    void fetchCategories().then((cats) => {
      if (alive) setCategories(cats);
    });
    return () => {
      alive = false;
    };
  }, []);

  return categories;
}
