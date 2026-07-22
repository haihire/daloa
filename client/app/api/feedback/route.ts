import { NextRequest, NextResponse } from "next/server";

const NEST_API = process.env.NEST_API_URL ?? "http://localhost:3001";
const TELEMETRY_INGEST_TOKEN = process.env.TELEMETRY_INGEST_TOKEN ?? "";

// 서버에서도 동일 검증 (Nest의 FEEDBACK_MAX_LENGTH와 맞춤)
const MAX_LENGTH = 500;

/**
 * 익명 피드백 접수. Nest로 그대로 프록시하되
 *  - 인제스트 토큰을 붙이고 (Nest 직접 호출 차단)
 *  - 실제 클라이언트 IP를 X-Forwarded-For로 넘긴다 (Nest 레이트리밋용, 저장은 안 함)
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const message =
    typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json(
      { ok: false, message: "메시지를 입력해주세요." },
      { status: 400 },
    );
  }
  if (message.length > MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `메시지는 ${MAX_LENGTH}자 이내로 입력해주세요.` },
      { status: 400 },
    );
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  try {
    const res = await fetch(`${NEST_API}/api/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
        ...(origin ? { origin } : {}),
        ...(referer ? { referer } : {}),
        ...(TELEMETRY_INGEST_TOKEN
          ? { "x-telemetry-token": TELEMETRY_INGEST_TOKEN }
          : {}),
      },
      body: JSON.stringify({
        message,
        path: typeof body?.path === "string" ? body.path : "/",
        deviceType:
          typeof body?.deviceType === "string" ? body.deviceType : "unknown",
        // 방문 이력 요약 (익명 — 식별자 아님). 검증/클램프는 Nest가 담당.
        visitDays: body?.visitDays,
        visitCount: body?.visitCount,
        firstSeenAt: body?.firstSeenAt,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, message: "잠시 후 다시 시도해주세요." },
      { status: 503 },
    );
  }
}
