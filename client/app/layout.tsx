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
