"use client";

import { useState } from "react";
import { event as gaEvent } from "@/lib/gtag";
import { readVisitStats } from "@/lib/visitor-stats";

const MAX_LENGTH = 500;

function detectDeviceType(): "mobile" | "desktop" | "tablet" | "bot" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (/bot|crawler|spider|crawling/.test(ua)) return "bot";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  if (ua.length > 0) return "desktop";
  return "unknown";
}

/** 헤더에 들어가는 한 줄짜리 익명 피드백 폼 (입력창 상시 노출). */
export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) {
      setError("메시지를 입력해주세요.");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`메시지는 ${MAX_LENGTH}자 이내로 입력해주세요.`);
      return;
    }

    setSending(true);
    setError("");
    try {
      // 방문 이력 "요약"만 첨부한다 — 식별자는 보내지 않으므로 익명이 유지된다.
      const visit = readVisitStats();
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          path: window.location.pathname,
          deviceType: detectDeviceType(),
          visitDays: visit?.days ?? 0,
          visitCount: visit?.total ?? 0,
          firstSeenAt: visit?.firstSeenAt ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };

      if (!res.ok) {
        setError(
          data?.message ?? "전송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        );
        return;
      }

      gaEvent("feedback_submit", { component_name: "feedback" });
      setMessage("");
      setDone(true);
    } catch {
      setError("전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  return (
    // 안내 문구는 absolute로 띄워 헤더 높이를 밀지 않게 한다.
    <div className="relative">
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          type="text"
          value={message}
          maxLength={MAX_LENGTH}
          aria-label="의견 남기기"
          onChange={(e) => {
            setMessage(e.target.value);
            // 다시 입력을 시작하면 이전 전송 결과 문구를 치운다
            if (done) setDone(false);
            if (error) setError("");
          }}
          placeholder="의견을 남겨주세요"
          className="h-8 w-full min-w-0 rounded-full border border-slate-300 bg-white/90 px-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={sending}
          className="h-8 shrink-0 rounded-full bg-cyan-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "전송 중" : "제출"}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="absolute left-3 top-full mt-1 text-xs text-red-500 dark:text-red-400"
        >
          {error}
        </p>
      )}
      {done && !error && (
        <p
          role="status"
          className="absolute left-3 top-full mt-1 text-xs text-cyan-600 dark:text-cyan-400"
        >
          소중한 의견 감사합니다! 🙌
        </p>
      )}
    </div>
  );
}
