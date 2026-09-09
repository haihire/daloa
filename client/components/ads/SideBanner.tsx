"use client";

import { useEffect, useState } from "react";
import CoupangBanner from "./CoupangBanner";

/**
 * 좌우 세로 배너. 화면 폭에 맞는 단위 하나만 고른다.
 *
 * 세로 배너는 높이가 자산이라 transform: scale로 줄이면 안 된다 — 가로세로가 같은 비율로
 * 작아져서 폭이 좁아질수록 배너가 뭉텅 짧아진다. 그래서 축소 대신 폭이 다른 배너를
 * 갈아 끼운다. 높이는 어느 단계에서든 600px 그대로다.
 *
 * 좌우 컬럼 폭 = (화면폭 - 1100(가운데) - 32(간격)) / 2 = (화면폭 - 1132) / 2 이므로
 * 배너 폭 B가 들어가려면 화면이 2B + 1132 이상이어야 한다.
 *
 * 셋을 다 렌더하고 CSS로 감추면 보이지 않는 iframe까지 로드돼 노출로 집계된다.
 * 그래서 폭을 재서 해당하는 하나만 마운트한다.
 */
const STEPS = [
  { minWidth: 1740, id: 1027574, width: 300 }, // 컬럼 304px 이상
  { minWidth: 1460, id: 1027604, width: 160 }, // 컬럼 164px 이상
  { minWidth: 0, id: 1027605, width: 120 }, // 컬럼 최소 136px
] as const;

const HEIGHT = 600;

export default function SideBanner() {
  // 서버 렌더 시점엔 폭을 알 수 없다. 그리드가 컬럼 자리를 이미 잡아두므로
  // 하이드레이션 후 채워도 레이아웃이 밀리지 않는다.
  const [step, setStep] = useState<(typeof STEPS)[number] | null>(null);

  useEffect(() => {
    const pick = () => {
      const next = STEPS.find((s) => window.innerWidth >= s.minWidth);
      setStep((current) =>
        current?.id === next?.id ? current : (next ?? null),
      );
    };
    pick();

    window.addEventListener("resize", pick);
    return () => window.removeEventListener("resize", pick);
  }, []);

  if (!step) return null;

  return <CoupangBanner id={step.id} width={step.width} height={HEIGHT} />;
}
