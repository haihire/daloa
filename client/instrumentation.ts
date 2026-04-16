/**
 * Next.js instrumentation hook — 서버 프로세스 시작 시 1회 실행
 *
 * console.log / warn / error / debug 를 가로채
 * logs/app-YYYY-MM-DD.log 와 logs/error-YYYY-MM-DD.log 에 동시 기록.
 * 브라우저(Edge Runtime)에서는 실행되지 않고 Node.js 서버 측에서만 동작.
 *
 * 생성 파일:
 *   client/logs/app-YYYY-MM-DD.log   — 전체 로그
 *   client/logs/error-YYYY-MM-DD.log — error / warn 전용
 */
export const runtime = "nodejs"; // Edge Runtime에서 실행 안 함

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return; // Edge Runtime 제외

  const fs = await import("fs");
  const path = await import("path");

  const LOG_DIR = path.resolve(process.cwd(), "logs");
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  let currentDate = "";
  let appStream: ReturnType<typeof fs.createWriteStream> | null = null;
  let errorStream: ReturnType<typeof fs.createWriteStream> | null = null;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function ensureStreams() {
    const d = today();
    if (d === currentDate) return;
    appStream?.end();
    errorStream?.end();
    appStream = fs.createWriteStream(path.join(LOG_DIR, `app-${d}.log`), {
      flags: "a",
      encoding: "utf8",
    });
    errorStream = fs.createWriteStream(path.join(LOG_DIR, `error-${d}.log`), {
      flags: "a",
      encoding: "utf8",
    });
    currentDate = d;
  }

  function fmt(level: string, args: unknown[]) {
    const ts = new Date().toISOString();
    const msg = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    return `${ts} [${level.padEnd(5)}] ${msg}\n`;
  }

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origDebug = console.debug.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(...args);
    ensureStreams();
    appStream?.write(fmt("LOG", args));
  };

  console.debug = (...args: unknown[]) => {
    origDebug(...args);
    ensureStreams();
    appStream?.write(fmt("DEBUG", args));
  };

  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    ensureStreams();
    const line = fmt("WARN", args);
    appStream?.write(line);
    errorStream?.write(line);
  };

  console.error = (...args: unknown[]) => {
    origError(...args);
    ensureStreams();
    const line = fmt("ERROR", args);
    appStream?.write(line);
    errorStream?.write(line);
  };
}
