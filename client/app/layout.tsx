import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import GoogleAnalytics from "@/components/GoogleAnalytics";
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
  metadataBase: new URL("https://www.daloa.kr"),
  title: "다로아 - 로아 사이트 모음",
  description:
    "로스트아크 유용한 사이트 모음, 캐릭터 특성 빌드 분포를 한 번에 확인하세요.",
  openGraph: {
    title: "다로아 - 로아 사이트 모음",
    description:
      "로스트아크 유용한 사이트 모음, 캐릭터 특성 빌드 분포를 한 번에 확인하세요.",
    url: "https://www.daloa.kr",
    siteName: "다로아",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "다로아 대표 아이콘",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "다로아 - 로아 사이트 모음",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleAnalytics />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
