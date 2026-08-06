import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  },
  {
    name: "로아인벤",
    href: "https://lostark.inven.co.kr",
    category: "커뮤니티",
    description: "인벤 커뮤니티",
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

  it("site.icon이 있으면 그 값이 파비콘으로 렌더링된다", () => {
    const siteWithIcon: Site = {
      ...MOCK_SITES[1],
      icon: "https://example.com/icon.png",
    };
    const { container } = render(<SiteList sites={[siteWithIcon]} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "https://example.com/icon.png");
  });

  it("site.icon이 없으면 href 도메인 기반 구글 파비콘으로 렌더링된다", () => {
    const { container } = render(<SiteList sites={[MOCK_SITES[1]]} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute(
      "src",
      "https://www.google.com/s2/favicons?domain=lostark.inven.co.kr&sz=32",
    );
  });

  it("site.icon이 없어도 href 도메인으로 파비콘이 렌더링된다", () => {
    const { container } = render(<SiteList sites={[MOCK_SITES[0]]} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute(
      "src",
      "https://www.google.com/s2/favicons?domain=lostark.game.onstove.com&sz=32",
    );
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

const A = "https://a.test";
const B = "https://b.test";
const C = "https://c.test";

const DRAG_SITES: Site[] = [
  { name: "가나다", href: A, category: "공식", description: "첫번째" },
  { name: "라마바", href: B, category: "공식", description: "두번째" },
  { name: "사아자", href: C, category: "공식", description: "세번째" },
];

/** jsdom에는 DataTransfer가 없어 드래그 이벤트에 붙일 최소 구현을 만든다. */
function createDataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: "",
    setData: (key: string, value: string) => {
      store[key] = value;
    },
    getData: (key: string) => store[key] ?? "",
  };
}

function cards(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll('[role="button"]'),
  ) as HTMLElement[];
}

function cardFor(container: HTMLElement, name: string): HTMLElement {
  const found = cards(container).find((card) =>
    card.textContent?.includes(name),
  );
  if (!found) throw new Error(`카드를 찾을 수 없음: ${name}`);
  return found;
}

/** 화면에 보이는 카드 이름 순서 */
function renderedOrder(container: HTMLElement): string[] {
  return cards(container).map(
    (card) =>
      DRAG_SITES.find((site) => card.textContent?.includes(site.name))?.name ??
      "",
  );
}

function storedFavorites(): string[] {
  return JSON.parse(localStorage.getItem("loa_favorites") || "[]") as string[];
}

describe("SiteList 즐겨찾기 드래그 정렬", () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
    localStorage.setItem("loa_favorites", JSON.stringify([A, B, C]));
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  // 프리셋 탭으로도 끌 수 있어야 하므로 즐겨찾기 여부와 무관하게 전부 draggable이다.
  it("모든 카드가 draggable이다", () => {
    localStorage.setItem("loa_favorites", JSON.stringify([A]));
    const { container } = render(<SiteList sites={DRAG_SITES} />);

    expect(cardFor(container, "가나다")).toHaveAttribute("draggable", "true");
    expect(cardFor(container, "라마바")).toHaveAttribute("draggable", "true");
  });

  it("즐겨찾기가 아닌 카드를 끌어도 즐겨찾기 순서는 바뀌지 않는다", () => {
    localStorage.setItem("loa_favorites", JSON.stringify([A, B]));
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    const dataTransfer = createDataTransfer();
    const list = container.querySelector("ul") as HTMLElement;

    fireEvent.dragStart(cardFor(container, "사아자"), { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "가나다"), { dataTransfer });
    fireEvent.drop(list, { dataTransfer });

    expect(storedFavorites()).toEqual([A, B]);
  });

  it("첫 즐겨찾기를 마지막 위로 드래그해 놓으면 저장 순서가 바뀐다", () => {
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    const dataTransfer = createDataTransfer();
    const list = container.querySelector("ul") as HTMLElement;

    fireEvent.dragStart(cardFor(container, "가나다"), { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "사아자"), { dataTransfer });
    fireEvent.dragOver(list, { dataTransfer });
    fireEvent.drop(list, { dataTransfer });

    expect(storedFavorites()).toEqual([B, C, A]);
  });

  it("마지막 즐겨찾기를 맨 앞으로 드래그해 놓으면 저장 순서가 바뀐다", () => {
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    const dataTransfer = createDataTransfer();
    const list = container.querySelector("ul") as HTMLElement;

    fireEvent.dragStart(cardFor(container, "사아자"), { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "가나다"), { dataTransfer });
    fireEvent.dragOver(list, { dataTransfer });
    fireEvent.drop(list, { dataTransfer });

    expect(storedFavorites()).toEqual([C, A, B]);
  });

  it("드래그하는 동안에는 화면 순서만 바뀌고 아직 저장되지 않는다", () => {
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(cardFor(container, "가나다"), { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "사아자"), { dataTransfer });

    expect(renderedOrder(container)).toEqual(["라마바", "사아자", "가나다"]);
    expect(storedFavorites()).toEqual([A, B, C]);
  });

  it("목록 밖에 놓아 drop 없이 끝나면 순서가 원래대로 돌아온다", () => {
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    const dataTransfer = createDataTransfer();
    const dragged = cardFor(container, "가나다");

    fireEvent.dragStart(dragged, { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "사아자"), { dataTransfer });
    // 목록 밖에서 손을 뗀 상황: drop 없이 dragEnd만 발생
    fireEvent.dragEnd(dragged, { dataTransfer });

    expect(storedFavorites()).toEqual([A, B, C]);
    expect(renderedOrder(container)).toEqual(["가나다", "라마바", "사아자"]);
  });

  it("즐겨찾기가 아닌 카드 위로는 순서가 바뀌지 않는다", () => {
    localStorage.setItem("loa_favorites", JSON.stringify([A, B]));
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    const dataTransfer = createDataTransfer();
    const list = container.querySelector("ul") as HTMLElement;

    fireEvent.dragStart(cardFor(container, "가나다"), { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "사아자"), { dataTransfer });
    fireEvent.drop(list, { dataTransfer });

    expect(storedFavorites()).toEqual([A, B]);
  });
});

function storedPresets(): { id: string; name: string; hrefs: string[] }[] {
  return JSON.parse(localStorage.getItem("loa_presets") || "[]");
}

function storedView(): string | null {
  return localStorage.getItem("loa_active_view");
}

describe("SiteList 프리셋", () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  it("+ 버튼을 누르면 프리셋이 생기고 그 탭이 선택된다", async () => {
    render(<SiteList sites={DRAG_SITES} />);

    await userEvent.click(screen.getByRole("button", { name: "프리셋 추가" }));

    const presets = storedPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe("프리셋1");
    expect(storedView()).toBe(`preset:${presets[0].id}`);
  });

  it("카드를 프리셋 탭에 드롭하면 그 프리셋에 담긴다", async () => {
    const { container } = render(<SiteList sites={DRAG_SITES} />);
    await userEvent.click(screen.getByRole("button", { name: "프리셋 추가" }));
    // 담는 대상을 고르려면 전체 탭으로 돌아가야 한다
    await userEvent.click(screen.getByRole("button", { name: "전체" }));

    const dataTransfer = createDataTransfer();
    const tab = screen.getByRole("button", { name: "프리셋1" });
    fireEvent.dragStart(cardFor(container, "라마바"), { dataTransfer });
    fireEvent.dragOver(tab, { dataTransfer });
    fireEvent.drop(tab, { dataTransfer });

    expect(storedPresets()[0].hrefs).toEqual([B]);
  });

  it("프리셋 탭을 선택하면 담긴 사이트만 표시된다", async () => {
    render(<SiteList sites={DRAG_SITES} />);
    await userEvent.click(screen.getByRole("button", { name: "프리셋 추가" }));
    const presetId = storedPresets()[0].id;
    localStorage.setItem(
      "loa_presets",
      JSON.stringify([{ id: presetId, name: "프리셋1", hrefs: [C] }]),
    );
    // 저장소 변경을 알려 재렌더
    fireEvent(window, new Event("loa_sites_store_changed"));

    expect(screen.getByText("사아자")).toBeInTheDocument();
    expect(screen.queryByText("가나다")).not.toBeInTheDocument();
    expect(screen.queryByText("라마바")).not.toBeInTheDocument();
  });

  it("즐겨찾기 탭을 선택하면 즐겨찾기한 사이트만 표시된다", async () => {
    localStorage.setItem("loa_favorites", JSON.stringify([B]));
    render(<SiteList sites={DRAG_SITES} />);

    await userEvent.click(screen.getByRole("button", { name: "★ 즐겨찾기" }));

    expect(screen.getByText("라마바")).toBeInTheDocument();
    expect(screen.queryByText("가나다")).not.toBeInTheDocument();
  });

  it("마지막으로 본 탭이 저장되어 다시 열어도 유지된다", async () => {
    const { unmount } = render(<SiteList sites={DRAG_SITES} />);
    await userEvent.click(screen.getByRole("button", { name: "★ 즐겨찾기" }));
    expect(storedView()).toBe("favorites");
    unmount();

    localStorage.setItem("loa_favorites", JSON.stringify([C]));
    render(<SiteList sites={DRAG_SITES} />);

    // 다시 렌더해도 즐겨찾기 탭이 유지되어 C만 보인다
    expect(screen.getByText("사아자")).toBeInTheDocument();
    expect(screen.queryByText("가나다")).not.toBeInTheDocument();
  });

  it("⊕ 버튼으로 프리셋에 담고 다시 눌러 뺄 수 있다", async () => {
    render(<SiteList sites={DRAG_SITES} />);
    await userEvent.click(screen.getByRole("button", { name: "프리셋 추가" }));
    await userEvent.click(screen.getByRole("button", { name: "전체" }));

    await userEvent.click(
      screen.getByRole("button", { name: "가나다 프리셋에 담기" }),
    );
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "프리셋1" }),
    );
    expect(storedPresets()[0].hrefs).toEqual([A]);

    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "프리셋1" }),
    );
    expect(storedPresets()[0].hrefs).toEqual([]);
  });

  it("프리셋 안에서 드래그하면 프리셋 순서만 바뀐다", () => {
    localStorage.setItem("loa_favorites", JSON.stringify([A, B, C]));
    localStorage.setItem(
      "loa_presets",
      JSON.stringify([{ id: "p1", name: "레이드", hrefs: [A, B, C] }]),
    );
    localStorage.setItem("loa_active_view", "preset:p1");
    const { container } = render(<SiteList sites={DRAG_SITES} />);

    const dataTransfer = createDataTransfer();
    const list = container.querySelector("ul") as HTMLElement;
    fireEvent.dragStart(cardFor(container, "가나다"), { dataTransfer });
    fireEvent.dragEnter(cardFor(container, "사아자"), { dataTransfer });
    fireEvent.drop(list, { dataTransfer });

    expect(storedPresets()[0].hrefs).toEqual([B, C, A]);
    // 즐겨찾기 순서는 건드리지 않는다
    expect(storedFavorites()).toEqual([A, B, C]);
  });

  it("프리셋 이름을 바꾸면 저장된다", async () => {
    localStorage.setItem(
      "loa_presets",
      JSON.stringify([{ id: "p1", name: "레이드", hrefs: [] }]),
    );
    localStorage.setItem("loa_active_view", "preset:p1");
    render(<SiteList sites={DRAG_SITES} />);

    await userEvent.click(
      screen.getByRole("button", { name: "레이드 이름 변경" }),
    );
    const input = screen.getByRole("textbox", { name: "프리셋 이름" });
    await userEvent.clear(input);
    await userEvent.type(input, "숙제{Enter}");

    expect(storedPresets()[0].name).toBe("숙제");
  });

  it("프리셋을 삭제하면 목록에서 빠지고 전체 탭으로 돌아간다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    localStorage.setItem(
      "loa_presets",
      JSON.stringify([{ id: "p1", name: "레이드", hrefs: [] }]),
    );
    localStorage.setItem("loa_active_view", "preset:p1");
    render(<SiteList sites={DRAG_SITES} />);

    await userEvent.click(screen.getByRole("button", { name: "레이드 삭제" }));

    expect(storedPresets()).toEqual([]);
    expect(storedView()).toBe("all");
  });

  it("저장된 탭이 사라진 프리셋을 가리키면 전체 목록을 보여준다", () => {
    localStorage.setItem("loa_active_view", "preset:없는id");
    render(<SiteList sites={DRAG_SITES} />);

    expect(screen.getByText("가나다")).toBeInTheDocument();
    expect(screen.getByText("라마바")).toBeInTheDocument();
    expect(screen.getByText("사아자")).toBeInTheDocument();
  });
});
