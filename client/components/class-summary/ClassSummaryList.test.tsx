import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassSummaryList from "./ClassSummaryList";
import type { ClassSummary } from "@/types";

const MOCK_SUMMARIES: ClassSummary[] = [
  {
    className: "워로드",
    summary: "방패를 든 전사. 막탱이 최고야.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "버서커",
    summary: "거대한 도끼를 휘둘러.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "디스트로이어",
    summary: "중형 무기 거인.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "스트라이커",
    summary: "주먹으로 때리는 무도가.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "배틀마스터",
    summary: "무술의 거인.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "데빌헌터",
    summary: "총 잘 쏴.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "블래스터",
    summary: "소총 전문가.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "소서리스",
    summary: "마법으로 적을 태워.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
  {
    className: "아르카나",
    summary: "카드 마법사.",
    updatedAt: new Date("2026-04-20").toISOString(),
  },
];

describe("ClassSummaryList", () => {
  it("기본적으로 '전체' 탭이 활성화되고 모든 직업이 표시된다", () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    // 기본 탭이 활성화됨
    const allTab = screen.getByRole("button", { name: "전체" });
    expect(allTab).toHaveClass("bg-slate-50");

    // 모든 직업이 표시됨
    expect(screen.getByText("워로드")).toBeInTheDocument();
    expect(screen.getByText("스트라이커")).toBeInTheDocument();
    expect(screen.getByText("소서리스")).toBeInTheDocument();
  });

  it("'전사' 탭 클릭 시 전사 계열 직업만 표시된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const 전사Tab = screen.getByRole("button", { name: "전사" });
    await userEvent.click(전사Tab);

    await waitFor(() => {
      // 전사 직업들만 표시
      expect(screen.getByText("워로드")).toBeInTheDocument();
      expect(screen.getByText("버서커")).toBeInTheDocument();
      expect(screen.getByText("디스트로이어")).toBeInTheDocument();

      // 다른 계열 직업들은 표시되지 않음
      expect(screen.queryByText("스트라이커")).not.toBeInTheDocument();
      expect(screen.queryByText("소서리스")).not.toBeInTheDocument();
    });
  });

  it("'무도가' 탭 클릭 시 무도가 계열 직업만 표시된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const 무도가Tab = screen.getByRole("button", { name: "무도가" });
    await userEvent.click(무도가Tab);

    await waitFor(() => {
      expect(screen.getByText("스트라이커")).toBeInTheDocument();
      expect(screen.getByText("배틀마스터")).toBeInTheDocument();

      // 다른 계열은 표시되지 않음
      expect(screen.queryByText("워로드")).not.toBeInTheDocument();
      expect(screen.queryByText("소서리스")).not.toBeInTheDocument();
    });
  });

  it("검색어를 입력하면 매칭되는 직업만 필터링된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const searchInput = screen.getByPlaceholderText("직업 검색");
    await userEvent.type(searchInput, "워로드");

    await waitFor(() => {
      expect(screen.getByText("워로드")).toBeInTheDocument();

      // 다른 직업들은 보이지 않음
      expect(screen.queryByText("버서커")).not.toBeInTheDocument();
      expect(screen.queryByText("스트라이커")).not.toBeInTheDocument();
    });
  });

  it("탭 클릭 시 검색어가 초기화되고 탭의 직업들이 표시된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const searchInput = screen.getByPlaceholderText(
      "직업 검색",
    ) as HTMLInputElement;
    await userEvent.type(searchInput, "워로드");

    // 워로드만 표시됨
    await waitFor(() => {
      expect(screen.getByText("워로드")).toBeInTheDocument();
      expect(screen.queryByText("버서커")).not.toBeInTheDocument();
    });

    // 전사 탭 클릭
    const 전사Tab = screen.getByRole("button", { name: "전사" });
    await userEvent.click(전사Tab);

    // 검색어가 초기화되고 전사 탭의 모든 직업이 표시됨
    await waitFor(() => {
      expect(searchInput.value).toBe("");
      expect(screen.getByText("워로드")).toBeInTheDocument();
      expect(screen.getByText("버서커")).toBeInTheDocument();
      expect(screen.getByText("디스트로이어")).toBeInTheDocument();
    });
  });

  it("검색 결과가 없으면 '데이터 집계 중…' 메시지가 표시된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const searchInput = screen.getByPlaceholderText("직업 검색");
    await userEvent.type(searchInput, "존재하지않는직업");

    await waitFor(() => {
      expect(screen.getByText("데이터 집계 중…")).toBeInTheDocument();
    });
  });

  it("빈 summaries 배열을 안전하게 처리한다", () => {
    render(<ClassSummaryList summaries={[]} />);

    expect(screen.getByText("데이터 집계 중…")).toBeInTheDocument();
  });

  it("한글 검색이 정상 작동한다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const searchInput = screen.getByPlaceholderText("직업 검색");
    await userEvent.type(searchInput, "스트");

    await waitFor(() => {
      expect(screen.getByText("스트라이커")).toBeInTheDocument();
      expect(screen.queryByText("배틀마스터")).not.toBeInTheDocument();
    });
  });

  it("여러 탭을 순차적으로 클릭할 수 있다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const 전사Tab = screen.getByRole("button", { name: "전사" });
    const 무도가Tab = screen.getByRole("button", { name: "무도가" });
    const 마법사Tab = screen.getByRole("button", { name: "마법사" });

    // 전사 탭
    await userEvent.click(전사Tab);
    await waitFor(() => {
      expect(screen.getByText("워로드")).toBeInTheDocument();
    });

    // 무도가 탭
    await userEvent.click(무도가Tab);
    await waitFor(() => {
      expect(screen.queryByText("워로드")).not.toBeInTheDocument();
      expect(screen.getByText("스트라이커")).toBeInTheDocument();
    });

    // 마법사 탭
    await userEvent.click(마법사Tab);
    await waitFor(() => {
      expect(screen.queryByText("스트라이커")).not.toBeInTheDocument();
      expect(screen.getByText("소서리스")).toBeInTheDocument();
    });
  });

  it("직업 요약문(summary)이 정상 표시된다", () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    expect(
      screen.getByText("방패를 든 전사. 막탱이 최고야."),
    ).toBeInTheDocument();
    expect(screen.getByText("거대한 도끼를 휘둘러.")).toBeInTheDocument();
  });

  it("'헌터' 탭에는 5개의 헌터 계열 직업만 포함된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const 헌터Tab = screen.getByRole("button", { name: "헌터" });
    await userEvent.click(헌터Tab);

    await waitFor(() => {
      expect(screen.getByText("데빌헌터")).toBeInTheDocument();
      expect(screen.getByText("블래스터")).toBeInTheDocument();

      // 전사나 무도가는 표시되지 않음
      expect(screen.queryByText("워로드")).not.toBeInTheDocument();
      expect(screen.queryByText("스트라이커")).not.toBeInTheDocument();
    });
  });

  it("'마법사' 탭에는 4개의 마법사 계열 직업이 포함된다", async () => {
    render(<ClassSummaryList summaries={MOCK_SUMMARIES} />);

    const 마법사Tab = screen.getByRole("button", { name: "마법사" });
    await userEvent.click(마법사Tab);

    await waitFor(() => {
      expect(screen.getByText("소서리스")).toBeInTheDocument();
      expect(screen.getByText("아르카나")).toBeInTheDocument();
    });
  });

  it("탭 전환 후 리스트가 스크롤 위치가 초기화된다 (key 변경)", async () => {
    const { container } = render(
      <ClassSummaryList summaries={MOCK_SUMMARIES} />,
    );

    // 오른쪽 스크롤 리스트 요소(탭 콘텐츠 영역)
    const initialList = container.querySelector(
      "ul.flex-1.min-h-0.overflow-y-auto",
    ) as HTMLUListElement;
    initialList.scrollTop = 120;
    expect(initialList.scrollTop).toBe(120);

    const 전사Tab = screen.getByRole("button", { name: "전사" });
    await userEvent.click(전사Tab);

    await waitFor(() => {
      const newList = container.querySelector(
        "ul.flex-1.min-h-0.overflow-y-auto",
      ) as HTMLUListElement;
      // key 변경으로 DOM이 재생성되어야 함
      expect(newList).not.toBe(initialList);
      // 새 리스트는 기본 스크롤 위치(0)여야 함
      expect(newList.scrollTop).toBe(0);
    });
  });
});
