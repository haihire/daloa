"use client";

import { useState } from "react";

export type AdminRole = "master" | "guest" | null;

export function readAdminRole(): AdminRole {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)admin_role=([^;]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return value === "master" || value === "guest" ? value : null;
}

export function useAdminRole(): AdminRole {
  const [role] = useState<AdminRole>(() => readAdminRole());
  return role;
}

export function buildGuestNotice(action: string): string {
  return [
    `게스트 계정은 ${action} 작업을 할 수 없습니다.`,
    "흐름: 로그인 세션 확인 -> 역할(role) 확인 -> 쓰기 작업 차단",
  ].join("\n");
}
