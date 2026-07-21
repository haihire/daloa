import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import FeedbackButton from "./FeedbackButton";

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, id: 1 }),
  });
}

async function openDialog() {
  const user = userEvent.setup();
  render(<FeedbackButton />);
  await user.click(screen.getByRole("button", { name: /의견 남기기/ }));
  return user;
}

describe("FeedbackButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchOk());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("버튼을 클릭하면 의견 입력 다이얼로그가 열린다", async () => {
    await openDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/불편한 점이나 추가했으면 하는 사이트/),
    ).toBeInTheDocument();
  });

  it("코멘트 등록 시 입력한 메시지를 /api/feedback으로 POST한다", async () => {
    const user = await openDialog();

    await user.type(
      screen.getByPlaceholderText(/불편한 점이나 추가했으면 하는 사이트/),
      "검색이 느려요",
    );
    await user.click(screen.getByRole("button", { name: "코멘트 등록" }));

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

  it("전송에 성공하면 감사 메시지를 보여준다", async () => {
    const user = await openDialog();

    await user.type(
      screen.getByPlaceholderText(/불편한 점이나 추가했으면 하는 사이트/),
      "좋은 사이트네요",
    );
    await user.click(screen.getByRole("button", { name: "코멘트 등록" }));

    expect(await screen.findByText(/소중한 의견 감사합니다/)).toBeInTheDocument();
  });

  it("빈 메시지로 등록하면 요청하지 않고 안내 문구를 보여준다", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "코멘트 등록" }));

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
    const user = await openDialog();

    await user.type(
      screen.getByPlaceholderText(/불편한 점이나 추가했으면 하는 사이트/),
      "도배 테스트",
    );
    await user.click(screen.getByRole("button", { name: "코멘트 등록" }));

    expect(
      await screen.findByText("잠시 후 다시 의견을 남겨주세요."),
    ).toBeInTheDocument();
  });

  it("취소를 누르면 다이얼로그가 닫힌다", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
