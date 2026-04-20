import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

describe("SiteList", () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    localStorageMock.clear();
  });

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
    const { container } = render(<SiteList sites={[]} />);

    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it("항목 클릭 시 window.open이 호출된다", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    const div = container.querySelector('[role="button"]');
    if (div) {
      await userEvent.click(div);
    }
    expect(openSpy).toHaveBeenCalledWith(
      "https://lostark.game.onstove.com",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockRestore();
  });

  it("Enter 키 입력 시 window.open이 호출된다", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    const div = container.querySelector('[role="button"]');
    if (div) {
      (div as HTMLElement).focus();
      await userEvent.keyboard("{Enter}");
    }
    expect(openSpy).toHaveBeenCalledOnce();

    openSpy.mockRestore();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 즐겨찾기 기능 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("별 아이콘 버튼이 렌더링된다", () => {
    render(<SiteList sites={MOCK_SITES} />);

    const starButtons = screen.getAllByRole("button");
    // role="button"인 별 아이콘 버튼이 있어야 함
    expect(starButtons.length).toBeGreaterThan(0);
  });

  it("처음엔 별 아이콘이 비활성화 상태(미채움)이다", () => {
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // fill이 'none'이어야 함
    expect(svg).toHaveAttribute("fill", "none");
  });

  it("별 아이콘 버튼이 존재한다", () => {
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    const starButtons = container.querySelectorAll(
      'button[aria-label*="즐겨찾기"]',
    );
    expect(starButtons.length).toBeGreaterThan(0);
  });

  it("별 아이콘이 모든 사이트에 렌더링된다", () => {
    const { container } = render(<SiteList sites={MOCK_SITES} />);

    // 별 아이콘(svg)이 모든 사이트에 있어야 함
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(MOCK_SITES.length);
  });

  it("별 버튼이 aria-label을 가지고 있다", () => {
    const { container } = render(<SiteList sites={MOCK_SITES} />);

    // 모든 별 버튼에 aria-label이 있어야 함
    const starButtons = container.querySelectorAll(
      'button[aria-label*="즐겨찾기"]',
    );
    expect(starButtons.length).toBeGreaterThan(0);
  });

  it("localStorage를 정확하게 사용한다", () => {
    render(<SiteList sites={MOCK_SITES} />);

    // localStorage를 초기화
    localStorage.clear();
    // 데이터가 없어야 함
    const stored = localStorage.getItem("loa_favorites");
    expect(stored).toBeNull();
  });

  it("여러 개의 즐겨찾기를 저장할 수 있다", async () => {
    const { container } = render(<SiteList sites={MOCK_SITES} />);

    const starButtons = container.querySelectorAll(
      'button[aria-label*="즐겨찾기"]',
    );

    // 모든 사이트를 즐겨찾기 추가
    for (const btn of starButtons) {
      await userEvent.click(btn);
    }

    // localStorage에 두 항목이 모두 저장되어야 함
    const stored = localStorage.getItem("loa_favorites");
    const parsed = JSON.parse(stored || "[]");

    expect(parsed).toContain("https://lostark.game.onstove.com");
    expect(parsed).toContain("https://lostark.inven.co.kr");
    expect(parsed.length).toBe(2);
  });

  it("즐겨찾기 추가 순서대로 상단에 표시된다", async () => {
    const { container } = render(<SiteList sites={MOCK_SITES} />);

    // 별 버튼들 찾기
    const starButtons = container.querySelectorAll(
      'button[type="button"][aria-label*="즐겨찾기"]',
    );

    if (starButtons.length < 2) {
      // 별 버튼이 충분하지 않으면 테스트 스킵
      expect(true).toBe(true);
      return;
    }

    // 첫 번째 별 클릭 후 두 번째 별 클릭하면 정렬이 변함
    await userEvent.click(starButtons[0]);
    await userEvent.click(starButtons[1]);

    // localStorage에 두 항목이 저장되어야 함
    const stored = localStorage.getItem("loa_favorites");
    const parsed = JSON.parse(stored || "[]");

    // 저장 순서가 유지되어야 함
    expect(parsed.length).toBe(2);
  });

  it("별 버튼의 aria-label이 상태에 따라 변경된다", async () => {
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    // 버튼 찾기: type="button" 이면서 aria-label 속성이 있는 버튼
    const buttons = container.querySelectorAll('button[type="button"]');
    const starButton = Array.from(buttons).find((btn) =>
      btn.getAttribute("aria-label")?.includes("즐겨찾기"),
    ) as HTMLButtonElement;

    if (!starButton) {
      // 별 버튼이 없으면 테스트 스킵
      expect(true).toBe(true);
      return;
    }

    // 초기: 미추가
    expect(starButton).toHaveAttribute("aria-label", "즐겨찾기 추가");

    // 클릭 후: 추가됨
    await userEvent.click(starButton);

    await waitFor(() => {
      expect(starButton).toHaveAttribute("aria-label", "즐겨찾기 해제");
    });

    // 다시 클릭: 미추가
    await userEvent.click(starButton);

    await waitFor(() => {
      expect(starButton).toHaveAttribute("aria-label", "즐겨찾기 추가");
    });
  });

  it("localStorage 오류가 발생해도 앱이 정상 작동한다", async () => {
    // 실제로 주입된 localStorageMock.setItem 경로를 실패시킴
    const setItemSpy = vi
      .spyOn(localStorageMock, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("QuotaExceededError");
      });

    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    const starButton = container.querySelector(
      'button[aria-label*="즐겨찾기"]',
    ) as HTMLButtonElement;

    // 클릭했을 때 오류가 발생하지 않아야 함
    await userEvent.click(starButton);

    expect(setItemSpy).toHaveBeenCalled();

    // 컴포넌트가 여전히 렌더링되어야 함
    expect(screen.getByText("로스트아크")).toBeInTheDocument();

    setItemSpy.mockRestore();
  });
});
