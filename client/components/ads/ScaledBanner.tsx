"use client";

import { useEffect, useRef, useState } from "react";
import CoupangBanner from "./CoupangBanner";

interface Props {
  id: number;
  width: number;
  height: number;
}

/**
 * 배너를 담긴 자리 폭에 맞춰 비율대로 줄여 보여준다.
 *
 * iframe은 안쪽 내용이 다시 접히지 않아 width를 줄이면 그냥 잘린다. 그래서 원본 크기로
 * 그린 뒤 transform: scale로 축소한다 — 창을 좁히면 배너도 같이 작아진다. 확대는 하지
 * 않는다(maxWidth = 원본 폭). 원본보다 키우면 흐려지기만 한다.
 *
 * 바깥 상자는 CSS만으로 "폭 = min(자리 폭, 원본 폭), 높이 = 원본 비율"이 되게 잡는다.
 * 그래야 배율을 재기 전에도 자리를 정확히 차지해 레이아웃이 밀리지 않는다.
 * 배율은 길이를 무단위 값으로 못 바꿔서 ResizeObserver로 실제 폭을 재서 계산한다.
 *
 * 축소 기준점은 반드시 top left다. 원본이 상자보다 넓을 때 center로 잡으면 기준점이
 * 상자 밖에 생겨 배너가 한쪽으로 밀린다.
 */
export default function ScaledBanner({ id, width, height }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const fit = () => setScale(box.clientWidth / width);
    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={boxRef}
      className="mx-auto w-full overflow-hidden"
      style={{ maxWidth: width, aspectRatio: `${width} / ${height}` }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <CoupangBanner id={id} width={width} height={height} />
      </div>
    </div>
  );
}
