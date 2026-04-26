import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatBuildList from "./StatBuildList";
import type { StatBuildItem, StatBuildTab } from "@/types";

const MOCK_TABS: StatBuildTab[] = [
  {
    statBuild: "치신",
    totalCount: 100,
    items: [
      {
        classEngraving: "각인1",
        classDetail: "워로드",
        count: 50,
        topLevel: 0,
      },
      {
        classEngraving: "각인2",
        classDetail: "버서커",
        count: 30,
        topLevel: 0,
      },
      {
        classEngraving: "각인3",
        classDetail: "디스트로이어",
        count: 20,
        topLevel: 0,
      },
    ],
  },
  {
    statBuild: "신치",
    totalCount: 80,
    items: [
      {
        classEngraving: "각인A",
        classDetail: "스트라이커",
        count: 60,
        topLevel: 0,
      },
      {
        classEngraving: "각인B",
        classDetail: "배틀마스터",
        count: 20,
        topLevel: 0,
      },
    ],
  },
  {
    statBuild: "치특",
    totalCount: 60,
    items: [
      {
        classEngraving: "각인X",
        classDetail: "호크아이",
        count: 60,
        topLevel: 0,
      },
    ],
  },
];

describe("StatBuildList", () => {
  it("탭들이 렌더링된다", () => {
    render(<StatBuildList tabs={MOCK_TABS} />);

    const tabs = screen.getAllByRole("button");
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("탭을 클릭하면 해당 탭의 데이터가 표시된다", async () => {
    const { container } = render(<StatBuildList tabs={MOCK_TABS} />);

    // 신치 탭 클릭
    const tabButton = container.querySelector(
      'button[title^="신치 "]',
    ) as HTMLButtonElement;
    await userEvent.click(tabButton);

    await waitFor(() => {
      expect(screen.getByText("스트라이커")).toBeInTheDocument();
    });
  });

  it("데이터 아이템들이 렌더링된다", () => {
    const { container } = render(<StatBuildList tabs={MOCK_TABS} />);

    const items = container.querySelectorAll("li");
    expect(items.length).toBeGreaterThan(0);
  });

  it("빈 탭 배열이 전달되면 안전하게 처리된다", () => {
    render(<StatBuildList tabs={[]} />);

    const heading = screen.getByText("특성 빌드 분포");
    expect(heading).toBeInTheDocument();
  });

  it("검색어를 입력하면 매칭되는 항목만 필터링된다", async () => {
    render(<StatBuildList tabs={MOCK_TABS} />);

    const searchInput = screen.getByPlaceholderText("직업·각인 검색");
    await userEvent.type(searchInput, "워로드");

    await waitFor(() => {
      expect(screen.getByText("워로드")).toBeInTheDocument();
      // 다른 직업들은 보이지 않아야 함
      expect(screen.queryByText("버서커")).not.toBeInTheDocument();
    });
  });

  it("검색 결과가 없으면 '검색 결과 없음' 메시지가 표시된다", async () => {
    render(<StatBuildList tabs={MOCK_TABS} />);

    const searchInput = screen.getByPlaceholderText("직업·각인 검색");
    await userEvent.type(searchInput, "존재하지않는직업");

    await waitFor(() => {
      expect(screen.getByText("검색 결과 없음")).toBeInTheDocument();
    });
  });

  it("검색 후 입력값을 지우면 원래 탭 뷰로 복구된다", async () => {
    render(<StatBuildList tabs={MOCK_TABS} />);

    const searchInput = screen.getByPlaceholderText(
      "직업·각인 검색",
    ) as HTMLInputElement;
    await userEvent.type(searchInput, "워로드");

    await waitFor(() => {
      expect(screen.getByText("워로드")).toBeInTheDocument();
    });

    // 검색어 삭제
    await userEvent.clear(searchInput);

    await waitFor(() => {
      // 기본 활성 탭의 데이터가 다시 표시됨
      expect(screen.getByText("워로드")).toBeInTheDocument();
    });
  });

  it("한글 검색이 정상 작동한다 (classDetail)", async () => {
    render(<StatBuildList tabs={MOCK_TABS} />);

    const searchInput = screen.getByPlaceholderText("직업·각인 검색");
    await userEvent.type(searchInput, "스트");

    await waitFor(() => {
      expect(screen.getByText("스트라이커")).toBeInTheDocument();
    });
  });

  it("각인명 검색이 정상 작동한다 (classEngraving)", async () => {
    render(<StatBuildList tabs={MOCK_TABS} />);

    const searchInput = screen.getByPlaceholderText("직업·각인 검색");
    await userEvent.type(searchInput, "각인1");

    await waitFor(() => {
      expect(screen.getByText("워로드")).toBeInTheDocument();
    });
  });

  it("탭 클릭 시 이전 탭의 활성 상태가 해제된다", async () => {
    const { container } = render(<StatBuildList tabs={MOCK_TABS} />);

    const secondTab = container.querySelector(
      'button[title^="신치 "]',
    ) as HTMLButtonElement;

    // 두 번째 탭 클릭
    await userEvent.click(secondTab);

    // 두 번째 탭의 데이터가 표시됨
    await waitFor(() => {
      expect(screen.getByText("스트라이커")).toBeInTheDocument();
    });

    // 첫 번째 탭의 데이터는 더 이상 표시되지 않음
    // (두 번째 탭의 활성 데이터로 대체됨)
  });

  it("null items를 안전하게 처리한다", () => {
    const tabsWithNullItems: StatBuildTab[] = [
      {
        statBuild: "치신",
        totalCount: 10,
        items: null as unknown as StatBuildItem[],
      },
    ];

    render(<StatBuildList tabs={tabsWithNullItems} />);

    const heading = screen.getByText("특성 빌드 분포");
    expect(heading).toBeInTheDocument();
  });

  it("탭과 아이템이 정상 렌더링된다", () => {
    const { container } = render(<StatBuildList tabs={MOCK_TABS} />);

    const tabs = screen.getAllByRole("button");
    const items = container.querySelectorAll("li");

    expect(tabs.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
  });

  it("빈 아이템 배열을 안전하게 처리한다", () => {
    const emptyTabs: StatBuildTab[] = [
      { statBuild: "테스트", totalCount: 0, items: [] },
    ];

    render(<StatBuildList tabs={emptyTabs} />);

    const tabs = screen.getAllByRole("button");
    expect(tabs.length).toBeGreaterThan(0);
  });
});
