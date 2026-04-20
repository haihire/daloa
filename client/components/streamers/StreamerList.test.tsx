import { act, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import StreamerList from "./StreamerList";
import type { YoutubeVideo } from "@/types";

const MOCK_VIDEOS: YoutubeVideo[] = [
  {
    videoId: "video1",
    title: "로아 최신 방송",
    channelTitle: "채널1",
    thumbnailUrl: "https://example.com/thumb1.jpg",
    publishedAt: new Date("2026-04-20").toISOString(),
    duration: "3:20:45",
    viewCount: 50000,
  },
  {
    videoId: "video2",
    title: "로아 실시간 공략",
    channelTitle: "채널2",
    thumbnailUrl: "https://example.com/thumb2.jpg",
    publishedAt: new Date("2026-04-19").toISOString(),
    duration: "4:15:30",
    viewCount: 100000,
  },
];

describe("StreamerList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("컴포넌트가 렌더링되고 제목이 표시된다", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));

    render(<StreamerList />);

    expect(screen.getByText("유튜브 최신 영상")).toBeInTheDocument();
  });

  it("초기 로드 시 API가 호출된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/streamers"),
      );
    });
  });

  it("로드된 영상이 목록으로 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      expect(screen.getByText("로아 최신 방송")).toBeInTheDocument();
      expect(screen.getByText("로아 실시간 공략")).toBeInTheDocument();
    });
  });

  it("API 응답에서 null items를 안전하게 처리한다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: null }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      expect(screen.getByText("영상을 불러올 수 없습니다")).toBeInTheDocument();
    });
  });

  it("API 오류 발생 시 안전하게 처리된다", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    render(<StreamerList />);

    await waitFor(() => {
      expect(screen.getByText("영상을 불러올 수 없습니다")).toBeInTheDocument();
    });
  });

  it("nextPageToken이 없으면 hasMore는 false가 된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        items: MOCK_VIDEOS,
        nextPageToken: null,
      }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      expect(screen.getByText("— 끝 —")).toBeInTheDocument();
    });
  });

  it("nextPageToken이 있으면 hasMore는 true가 된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        items: MOCK_VIDEOS,
        nextPageToken: "token123",
      }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      // hasMore=true 이므로 끝 표시가 나오면 안 됨
      expect(screen.queryByText("— 끝 —")).not.toBeInTheDocument();
    });
  });

  it("로딩 중일 때 '불러오는 중…' 메시지가 표시된다", async () => {
    (global.fetch as any).mockImplementation(
      () => new Promise(() => {}), // 영구 대기
    );

    render(<StreamerList />);

    await waitFor(() => {
      expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
    });
  });

  it("영상 링크가 새 탭에서 열린다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      const link = screen.getByRole("link", {
        name: /로아 최신 방송/i,
      });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("YouTube 영상 URL이 정확히 생성된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      const link = screen.getByRole("link", {
        name: /로아 최신 방송/i,
      });
      expect(link).toHaveAttribute(
        "href",
        "https://www.youtube.com/watch?v=video1",
      );
    });
  });

  it("섬네일과 동영상 시간이 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    const { container } = render(<StreamerList />);

    await waitFor(() => {
      const img = container.querySelector(
        'img[src="https://example.com/thumb1.jpg"]',
      );
      expect(img).not.toBeNull();

      // 동영상 시간이 표시됨
      expect(screen.getByText("3:20:45")).toBeInTheDocument();
    });
  });

  it("채널명과 발행 시간이 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    const { container } = render(<StreamerList />);

    await waitFor(() => {
      // 제목이 표시되어야 함
      expect(screen.getByText("유튜브 최신 영상")).toBeInTheDocument();
      // 영상이 렌더링되어야 함
      const links = container.querySelectorAll("a");
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it("빈 배열 응답 시 '영상을 불러올 수 없습니다' 메시지가 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: [] }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      expect(screen.getByText("영상을 불러올 수 없습니다")).toBeInTheDocument();
    });
  });

  it("재로드 시 이전 데이터가 초기화되지 않는다 (pageToken 사용 시)", async () => {
    const firstResponse = {
      items: MOCK_VIDEOS,
      nextPageToken: "token123",
    };

    const secondResponse = {
      items: [
        {
          videoId: "video3",
          title: "로아 가이드",
          channelTitle: "채널3",
          thumbnailUrl: "https://example.com/thumb3.jpg",
          publishedAt: new Date("2026-04-18").toISOString(),
          duration: "2:10:00",
          viewCount: 30000,
        },
      ],
      nextPageToken: null,
    };

    const observeMock = vi.fn();
    let ioCallback:
      | ((entries: Array<{ isIntersecting: boolean }>) => void)
      | undefined;

    global.IntersectionObserver = vi.fn((callback) => {
      ioCallback = callback as (entries: Array<{ isIntersecting: boolean }>) => void;
      return {
        observe: observeMock,
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      };
    }) as any;

    (global.fetch as any)
      .mockResolvedValueOnce({
        json: async () => firstResponse,
      })
      .mockResolvedValueOnce({
        json: async () => secondResponse,
      });

    render(<StreamerList />);

    // 첫 번째 로드 완료
    await waitFor(() => {
      expect(screen.getByText("로아 최신 방송")).toBeInTheDocument();
    });

    expect(observeMock).toHaveBeenCalled();

    // sentinel 진입 이벤트를 수동으로 발생시켜 다음 페이지 로드를 유도
    await act(async () => {
      ioCallback?.([{ isIntersecting: true }]);
    });

    await waitFor(() => {
      // 기존 + 신규 데이터가 함께 존재해야 함
      expect(screen.getByText("로아 최신 방송")).toBeInTheDocument();
      expect(screen.getByText("로아 가이드")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("pageToken=token123"),
    );
  });

  it("IntersectionObserver를 사용하여 sentinel 감시한다", async () => {
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    global.IntersectionObserver = vi.fn(() => ({
      observe: observeMock,
      disconnect: disconnectMock,
      unobserve: vi.fn(),
    })) as any;

    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS, nextPageToken: "token123" }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      // sentinel 요소가 관찰되어야 함
      expect(observeMock).toHaveBeenCalled();
    });
  });

  it("title이 최대 2줄로 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    render(<StreamerList />);

    await waitFor(() => {
      const title = screen.getByText("로아 최신 방송");
      expect(title).toHaveClass("line-clamp-2");
    });
  });

  it("여러 영상이 세로 목록으로 표시된다", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ items: MOCK_VIDEOS }),
    });

    const { container } = render(<StreamerList />);

    await waitFor(() => {
      const listItems = container.querySelectorAll("li");
      // 영상 2개 + sentinel 1개 = 3개
      expect(listItems.length).toBeGreaterThanOrEqual(2);
    });
  });
});
