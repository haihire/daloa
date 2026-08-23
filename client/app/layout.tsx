import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import MonitoringBeacon from "@/components/MonitoringBeacon";
import DarkModeToggleGuard from "@/components/DarkModeToggleGuard";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lomoa.kr"),
  title: "로모아 | 로스트아크 사이트 모음",
  description:
    "로스트아크 유용한 사이트 모음, 캐릭터 특성 빌드 분포를 한 번에 확인하세요.",
  openGraph: {
    title: "로모아 | 로스트아크 사이트 모음",
    description:
      "로스트아크 유용한 사이트 모음, 캐릭터 특성 빌드 분포를 한 번에 확인하세요.",
    url: "https://www.lomoa.kr",
    siteName: "로모아",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "로모아 대표 아이콘",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "로모아 | 로스트아크 사이트 모음",
    description:
      "로스트아크 유용한 사이트 모음, 캐릭터 특성 빌드 분포를 한 번에 확인하세요.",
    images: ["/icon.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased overflow-hidden`}
    >
      <head>
        {/* 다크모드 FOUC 방지: hydration 전에 동기 실행 */}

        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}})()`,
          }}
        />

        {/* 애드센스 소유권 확인 + 광고 게재.
            next/script(afterInteractive)를 쓰지 않고 head에 직접 박는다 — 그쪽은 하이드레이션
            이후 클라이언트가 주입해서 서버 HTML에 스니펫이 남지 않고, 심사 크롤러가 정적 HTML에서
            코드를 못 찾으면 소유권 확인이 실패할 수 있다. async라 렌더는 막지 않는다. */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9676954636003574"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <GoogleAnalytics />
        <MonitoringBeacon />
        <div className="fixed right-4 top-4 z-50">
          <DarkModeToggleGuard />
        </div>
        {children}
      </body>
    </html>
  );
}
