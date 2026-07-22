"use client";

import { useId, useState } from "react";
import { event as gaEvent } from "@/lib/gtag";

const MAX_LENGTH = 500;

function detectDeviceType(): "mobile" | "desktop" | "tablet" | "bot" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (/bot|crawler|spider|crawling/.test(ua)) return "bot";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  if (ua.length > 0) return "desktop";
  return "unknown";
}

export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fieldId = useId();

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
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          path: window.location.pathname,
          deviceType: detectDeviceType(),
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
    <section className="flex flex-col rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-md backdrop-blur dark:border-slate-700/70 dark:bg-slate-800/80 lg:h-[560px]">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        💬 의견 남기기
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        익명으로 전달됩니다. 개인정보는 저장하지 않아요.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-1 flex-col">
        <label htmlFor={fieldId} className="sr-only">
          의견
        </label>
        <textarea
          id={fieldId}
          value={message}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            setMessage(e.target.value);
            // 새로 입력을 시작하면 이전 전송 결과 문구를 치운다
            if (done) setDone(false);
            if (error) setError("");
          }}
          placeholder="불편한 점이나 추가했으면 하는 사이트를 알려주세요."
          className="min-h-[120px] flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        <div className="mt-1 flex min-h-5 items-center justify-between gap-2">
          <span className="text-xs">
            {error && (
              <span role="alert" className="text-red-500 dark:text-red-400">
                {error}
              </span>
            )}
            {done && !error && (
              <span role="status" className="text-cyan-600 dark:text-cyan-400">
                소중한 의견 감사합니다! 🙌
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {message.length}/{MAX_LENGTH}
          </span>
        </div>

        <button
          type="submit"
          disabled={sending}
          className="mt-2 w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "전송 중..." : "제출"}
        </button>
      </form>
    </section>
  );
}
