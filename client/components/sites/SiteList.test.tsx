import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import SiteList from "./SiteList";
import type { Site } from "@/types";

const MOCK_SITES: Site[] = [
  {
    name: "로스트아크",
    href: "https://lostark.game.onstove.com",
    category: "공식",
    description: "공식 홈페이지",
    icon: undefined,
  },
  {
    name: "로아인벤",
    href: "https://lostark.inven.co.kr",
    category: "커뮤니티",
    description: "인벤 커뮤니티",
    icon: "https://example.com/icon.png",
  },
];

describe("SiteList", () => {
  it("사이트 목록이 렌더링된다", () => {
    render(<SiteList sites={MOCK_SITES} />);

    expect(screen.getByText("로스트아크")).toBeInTheDocument();
    expect(screen.getByText("로아인벤")).toBeInTheDocument();
  });

  it("카테고리 뱃지가 표시된다", () => {
    render(<SiteList sites={MOCK_SITES} />);

    expect(screen.getByText("공식")).toBeInTheDocument();
    expect(screen.getByText("커뮤니티")).toBeInTheDocument();
  });

  it("설명 텍스트가 표시된다", () => {
    render(<SiteList sites={MOCK_SITES} />);

    expect(screen.getByText("공식 홈페이지")).toBeInTheDocument();
    expect(screen.getByText("인벤 커뮤니티")).toBeInTheDocument();
  });

  it("icon이 있는 사이트는 img가 렌더링된다", () => {
    const { container } = render(<SiteList sites={MOCK_SITES} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "https://example.com/icon.png");
  });

  it("icon이 없는 사이트는 img가 없다", () => {
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    expect(container.querySelector("img")).toBeNull();
  });

  it("빈 배열이면 아무것도 렌더링되지 않는다", () => {
    render(<SiteList sites={[]} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("항목 클릭 시 window.open이 호출된다", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<SiteList sites={[MOCK_SITES[0]]} />);

    await userEvent.click(screen.getByRole("button"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://lostark.game.onstove.com",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockRestore();
  });

  it("Enter 키 입력 시 window.open이 호출된다", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<SiteList sites={[MOCK_SITES[0]]} />);

    const btn = screen.getByRole("button");
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(openSpy).toHaveBeenCalledOnce();

    openSpy.mockRestore();
  });
});
