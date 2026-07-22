import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import FeedbackForm from "./FeedbackForm";

const PLACEHOLDER = /불편한 점이나 추가했으면 하는 사이트/;

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, id: 1 }),
  });
}

describe("FeedbackForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchOk());
  });

  afterEach(() => {
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

  it("전송에 성공하면 감사 문구를 보여주고 입력창을 비운다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "좋은 사이트네요");
    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(
      await screen.findByText(/소중한 의견 감사합니다/),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue("");
  });

  it("전송 성공 후 다시 입력하면 감사 문구가 사라진다", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "첫 의견");
    await user.click(screen.getByRole("button", { name: "제출" }));
    expect(
      await screen.findByText(/소중한 의견 감사합니다/),
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "두번째");

    await waitFor(() => {
      expect(
        screen.queryByText(/소중한 의견 감사합니다/),
      ).not.toBeInTheDocument();
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
