import SideBanner from "./SideBanner";
import BottomBanner from "./BottomBanner";

/**
 * 홈 그리드의 좌우 컬럼에 들어가는 세로 배너.
 *
 * 그리드가 [minmax(136px,1fr) | 최대 1100px | minmax(136px,1fr)]이라 좌우는 136px
 * 아래로 줄지 않고, 공간이 모자라면 가운데 목록이 대신 줄어든다. 배너는 컬럼 폭에
 * 맞는 단위로 갈아 끼운다(SideBanner) — 축소하지 않으므로 높이는 항상 600px다.
 *
 * 3열 그리드는 640px부터다. 그 아래(휴대폰)는 좌우에 광고를 넣을 자리가 없어
 * 하단 배너만 남긴다.
 */
export function SideAd() {
  return (
    <div
      className="hidden items-start justify-center pt-3 min-[640px]:flex"
      aria-hidden="true"
    >
      <SideBanner />
    </div>
  );
}

/** 사이트 목록 아래 가로 배너. 폭에 맞춰 단위를 고르고 비율대로 축소한다. */
export function BottomAd() {
  return (
    <div className="mt-4 w-full">
      <BottomBanner />
    </div>
  );
}
