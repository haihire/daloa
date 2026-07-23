import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import FeedbackForm from "./FeedbackForm";

const PLACEHOLDER = "의견을 남겨주세요";

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, id: 1 }),
  });
}

// 이 환경의 전역 localStorage는 Node의 빈 스텁이라 메서드가 없다.
// 다른 테스트들과 동일하게 동작하는 목을 심어준다.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

describe("FeedbackForm", () => {
  beforeEach(() => {
    // 방문 이력이 테스트 간에 새지 않도록 매번 비운다
    localStorageMock.clear();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
    vi.stubGlobal("fetch", mockFetchOk());
  });

  afterEach(() => {
    // 가짜 타이머를 쓴 테스트가 실패해도 다음 테스트로 새지 않도록 항상 되돌린다
    vi.useRealTimers();
    localStorageMock.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("입력창과 제출 버튼이 처음부터 열려 있다", () => {
    render(<FeedbackForm />);

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제출" })).toBeInTheDocument();
  });

  it("제출 시 입력한 메시지를 /api/feedback으로 POST한다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "검색이 느려요");
    await user.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      message: "검색이 느려요",
    });
  });

  it("저장된 방문 이력이 있으면 요약을 함께 보낸다", async () => {
    localStorage.setItem(
      "loa_visit_stats",
      JSON.stringify({
        firstSeenAt: "2026-05-01",
        lastVisitDay: "2026-07-21",
        days: 12,
        total: 32,
      }),
    );
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "단골 의견");
    await user.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      visitDays: 12,
      visitCount: 32,
      firstSeenAt: "2026-05-01",
    });
  });

  it("방문 이력이 없으면 0으로 보낸다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "첫 방문 의견");
    await user.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      visitDays: 0,
      visitCount: 0,
      firstSeenAt: null,
    });
  });

  it("전송에 성공하면 체크 표시가 뜨고 입력창이 비워진다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "좋은 사이트네요");
    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(await screen.findByRole("status")).toHaveTextContent("✓");
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue("");
  });

  it("체크 표시는 3초 뒤 사라진다", async () => {
    vi.useFakeTimers();
    // userEvent는 내부 지연이 가짜 타이머와 얽혀 멈추므로 여기서만 fireEvent를 쓴다
    const { container } = render(<FeedbackForm />);

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "의견" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    // 가짜 타이머 중에는 waitFor가 진행되지 않으므로 fetch 프라미스를 직접 소진시킨다
    await act(async () => {});
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("전송 성공 후 다시 입력하면 체크 표시가 사라진다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "첫 의견");
    await user.click(screen.getByRole("button", { name: "제출" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "두번째");

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("빈 메시지로 제출하면 요청하지 않고 안내 문구를 보여준다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(
      await screen.findByText("메시지를 입력해주세요."),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("서버가 에러를 반환하면 서버 메시지를 그대로 노출한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "잠시 후 다시 의견을 남겨주세요." }),
      }),
    );
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "도배 테스트");
    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(
      await screen.findByText("잠시 후 다시 의견을 남겨주세요."),
    ).toBeInTheDocument();
  });
});
