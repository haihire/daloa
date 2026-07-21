"use client";

import { useEffect, useId, useRef, useState } from "react";
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

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 백드롭에서 시작한 프레스만 닫기로 처리 — textarea 드래그 선택 중 밖에서 손을 떼도
  // 모달이 닫히지 않게 한다.
  const overlayPressOnSelf = useRef(false);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setError("");
    setDone(false);
  }

  async function submit() {
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
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!res.ok) {
        setError(data?.message ?? "전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-300"
      >
        💬 의견 남기기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            overlayPressOnSelf.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && overlayPressOnSelf.current) {
              close();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <h2
              id={titleId}
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              의견 남기기
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              익명으로 전달됩니다. 개인정보는 저장하지 않아요.
            </p>

            {done ? (
              <div className="mt-4 flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  소중한 의견 감사합니다! 🙌
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
                >
                  닫기
                </button>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={message}
                  maxLength={MAX_LENGTH}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="불편한 점이나 추가했으면 하는 사이트를 알려주세요."
                  rows={5}
                  className="mt-3 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    role="alert"
                    className="text-xs text-red-500 dark:text-red-400"
                  >
                    {error}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {message.length}/{MAX_LENGTH}
                  </span>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "전송 중..." : "코멘트 등록"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
