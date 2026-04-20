import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import YoutubeList from "./YoutubeList";
import type { YoutubeVideo } from "@/types";

const MOCK_VIDEOS: YoutubeVideo[] = [
  {
    videoId: "video1",
    title: "로스트아크 공략",
    channelTitle: "채널1",
    thumbnailUrl: "https://example.com/thumb1.jpg",
    publishedAt: new Date("2026-04-20").toISOString(),
    duration: "15:30",
    viewCount: 50000,
  },
  {
    videoId: "video2",
    title: "로스트아크 팁",
    channelTitle: "채널2",
    thumbnailUrl: "https://example.com/thumb2.jpg",
    publishedAt: new Date("2026-04-19").toISOString(),
    duration: "20:45",
    viewCount: 100000,
  },
];

describe("YoutubeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("로딩 중일 때 스켈레톤이 표시된다", async () => {
    (global.fetch as any).mockImplementation(
      () => new Promise(() => {}), // 영구 대기
    );

    render(<YoutubeList />);

    await waitFor(() => {
      const skeleton = document.querySelector(".animate-pulse.bg-slate-100");
      expect(skeleton).toBeInTheDocument();
    });
  });

  it("데이터 로드 후 영상 목록이 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<YoutubeList />);

    await waitFor(() => {
      expect(screen.getByText("로스트아크 공략")).toBeInTheDocument();
      expect(screen.getByText("로스트아크 팁")).toBeInTheDocument();
    });
  });

  it("로드 완료 전 좌우 버튼이 비활성화된다", async () => {
    (global.fetch as any).mockImplementation(
      () => new Promise(() => {}), // 영구 대기
    );

    render(<YoutubeList />);

    await waitFor(() => {
      const prevBtn = screen.getByRole("button", { name: "이전" });
      const nextBtn = screen.getByRole("button", { name: "다음" });
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });
  });

  it("로드 완료 후 좌우 버튼이 활성화된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<YoutubeList />);

    await waitFor(() => {
      const prevBtn = screen.getByRole("button", { name: "이전" });
      const nextBtn = screen.getByRole("button", { name: "다음" });
      expect(prevBtn).not.toBeDisabled();
      expect(nextBtn).not.toBeDisabled();
    });
  });

  it("빈 배열 응답 시 아무것도 렌더링되지 않는다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: [] }),
    });

    const { container } = render(<YoutubeList />);

    await waitFor(() => {
      const section = container.querySelector("section");
      expect(section).not.toBeInTheDocument();
    });
  });

  it("API 오류 발생 시 안전하게 처리된다", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    const { container } = render(<YoutubeList />);

    await waitFor(() => {
      const section = container.querySelector("section");
      expect(section).not.toBeInTheDocument();
    });
  });

  it("null items 응답 시 안전하게 처리된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: null }),
    });

    const { container } = render(<YoutubeList />);

    await waitFor(() => {
      const section = container.querySelector("section");
      expect(section).not.toBeInTheDocument();
    });
  });

  it("영상들이 최신순으로 정렬된다", async () => {
    const unordered = [
      {
        ...MOCK_VIDEOS[0],
        publishedAt: new Date("2026-04-18").toISOString(),
      },
      {
        ...MOCK_VIDEOS[1],
        publishedAt: new Date("2026-04-20").toISOString(),
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: unordered }),
    });

    render(<YoutubeList />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      // 최신이 먼저 표시되어야 함
      expect(links[0]).toHaveAttribute(
        "href",
        expect.stringContaining("video2"),
      );
      expect(links[1]).toHaveAttribute(
        "href",
        expect.stringContaining("video1"),
      );
    });
  });

  it("오른쪽 버튼이 활성화되어 있다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<YoutubeList />);

    await waitFor(() => {
      expect(screen.getByText("로스트아크 공략")).toBeInTheDocument();
    });

    const rightBtn = screen.getByRole("button", { name: "다음" });

    // 버튼이 활성화되어야 함
    expect(rightBtn).not.toBeDisabled();
  });

  it("제목이 최대 2줄로 표시된다 (line-clamp-2)", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<YoutubeList />);

    await waitFor(() => {
      const titleEl = screen.getByText("로스트아크 공략");
      expect(titleEl).toHaveClass("line-clamp-2");
    });
  });

  it("YouTube 링크가 새 탭에서 열린다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<YoutubeList />);

    await waitFor(() => {
      const link = screen.getByRole("link", {
        name: /로스트아크 공략/i,
      });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
});
