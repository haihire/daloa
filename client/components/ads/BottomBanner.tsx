"use client";

import { useEffect, useState } from "react";
import ScaledBanner from "./ScaledBanner";

/**
 * 사이트 목록 아래 가로 배너. 화면 폭에 맞는 단위 하나만 고른다.
 *
 * 가로 배너는 세로 배너와 달리 비율 축소가 자연스러워 ScaledBanner로 줄인다. 다만 넓은
 * 배너(970x90)를 휴대폰까지 끌고 가면 높이가 30px대로 눌려 광고 구실을 못 해서, 좁은
 * 화면에는 비율이 다른 320x100을 쓴다.
 *
 * 둘을 다 렌더하고 CSS로 감추면 보이지 않는 iframe까지 로드돼 노출로 집계된다.
 * 그래서 폭을 재서 해당하는 하나만 마운트한다.
 */
const STEPS = [
  { minWidth: 900, id: 1027532, width: 970, height: 90 },
  { minWidth: 0, id: 1027533, width: 320, height: 100 },
] as const;

export default function BottomBanner() {
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

  return <ScaledBanner id={step.id} width={step.width} height={step.height} />;
}
