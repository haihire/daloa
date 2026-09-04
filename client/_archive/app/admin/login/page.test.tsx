import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLoginPage from "./page";

describe("AdminLoginPage", () => {
  let replaceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { replace: replaceSpy, href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("로그인 성공 시 window.location.replace로 /admin/sites 이동", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(<AdminLoginPage />);
    await userEvent.type(screen.getByRole("textbox"), "admin");
    const passwordInput = document.querySelector<HTMLInputElement>(
      'input[type="password"]',
    )!;
    await userEvent.type(passwordInput, "password");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/admin/monitoring");
    });
  });

  it("로그인 실패 시 에러 메시지 표시", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "인증 실패" }),
      }),
    );

    render(<AdminLoginPage />);
    await userEvent.type(screen.getByRole("textbox"), "wrong");
    const passwordInput = document.querySelector<HTMLInputElement>(
      'input[type="password"]',
    )!;
    await userEvent.type(passwordInput, "wrong");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => {
      expect(screen.getByText("인증 실패")).toBeTruthy();
    });
  });

  it("게스트 로그인 버튼 클릭 시 guest 계정으로 자동 로그인", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(<AdminLoginPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "게스트 로그인" }),
    );

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/admin/monitoring");
    });
  });
});
