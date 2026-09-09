/**
 * 쿠팡 파트너스 다이나믹 배너.
 *
 * 쿠팡이 주는 기본 스니펫은 `g.js`를 불러온 뒤 `new PartnersCoupang.G(...)`가 스크립트가
 * 놓인 자리에 배너를 그리는 방식이다. React는 DOM을 직접 관리하므로 그 방식으로 한 페이지에
 * 여러 개를 서로 다른 위치에 띄우면 그리는 위치를 보장할 수 없다(위치 지정 옵션이 없다).
 *
 * 그래서 g.js가 최종적으로 띄우는 것과 같은 위젯 페이지를 iframe으로 직접 부른다. 파라미터는
 * 쿠팡이 생성해준 값(id·trackingCode·크기)을 그대로 쓴다 — 광고 단위별로 자리를 확실히
 * 잡을 수 있고, 정적 export에서도 하이드레이션 문제가 없다.
 */
const TRACKING_CODE = "AF2540400";

interface Props {
  /** 쿠팡 파트너스에서 배너별로 발급한 id */
  id: number;
  width: number;
  height: number;
  className?: string;
}

export default function CoupangBanner({ id, width, height, className }: Props) {
  const src =
    `https://ads-partners.coupang.com/widgets.html` +
    `?id=${id}&template=carousel&trackingCode=${TRACKING_CODE}` +
    `&subId=&width=${width}&height=${height}&tsource=`;

  return (
    <iframe
      src={src}
      width={width}
      height={height}
      title="쿠팡 파트너스 광고"
      // 첫 화면 밖(좌우·하단)에 있으므로 지연 로드해 초기 렌더를 막지 않는다
      loading="lazy"
      className={className}
      style={{ border: 0, display: "block", maxWidth: "100%" }}
    />
  );
}
