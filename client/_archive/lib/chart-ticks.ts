// 관리자 차트 X축 날짜 라벨을 접어주는 공용 유틸.
//
// 목적: 하단 축에 반복되는 월/일을 지워 가독성을 높이고, 일별 축에서 날짜가
// 임의로 스킵되는 문제를 없앤다. recharts <XAxis>에 `{...dateAxis(data, key)}`로 펼쳐 쓴다.
//
// 포맷별 동작
//  - "MM-DD HH:MI" (시간별)  → 날짜가 바뀌는 지점에만 라벨. 월이 바뀌는(또는 첫) 날은 "M/D",
//                              같은 달 안은 일자만("15"). 같은 날 시각은 라벨 생략(정확 시각은 툴팁).
//  - "MM-DD" / "M/D" (일별)  → 월이 바뀔 때만 "M/D", 그 외엔 일자만("15"). 점이 적으면 전부 표시(스킵 없음),
//                              많으면(>31) 솎아내되 보이는 눈금마다 월을 붙여 모호함을 막는다.
//  - "HH:MI" (하루 시간별)    → 그대로 두고 recharts 기본 솎아내기를 쓴다.

// "MM-DD", "M/D", "MM-DD HH:MI" 모두 파싱. 그룹: 1=월, 2=일, 3=시, 4=분(옵션).
const DATE_RE = /^(\d{1,2})[-/](\d{1,2})(?:[ T](\d{2}):(\d{2}))?$/;

// 일별 축에서 이 개수를 넘으면 전부 표시하지 않고 솎아낸다(라벨 겹침 방지).
const DENSE_THRESHOLD = 31;

type AxisInterval = number | "preserveStartEnd";

export interface DateAxisProps {
  tickFormatter: (value: string) => string;
  interval: AxisInterval;
  tickLine?: boolean;
}

const md = (m: RegExpExecArray) => `${Number(m[1])}/${Number(m[2])}`;

export function dateAxis(data: readonly unknown[], key: string): DateAxisProps {
  const labels = new Map<string, string>();
  let hasDatetime = false;
  let hasDateOnly = false;
  let prevDay: number | null = null;
  let prevMonth: number | null = null;

  for (const row of data) {
    const raw = String((row as Record<string, unknown>)?.[key] ?? "");
    const m = DATE_RE.exec(raw);
    if (!m) {
      labels.set(raw, raw); // 형식 밖(예: "HH:MI")은 그대로 둔다.
      continue;
    }
    const month = Number(m[1]);
    const day = Number(m[2]);
    const hasTime = m[3] != null;

    if (hasTime) {
      hasDatetime = true;
      // 날짜가 바뀌는 첫 지점에만 라벨. 같은 날은 생략.
      // 월이 바뀌는(또는 첫) 날은 "M/D"로 표기해 7월→8월 경계가 보이게 하고,
      // 그 외 같은 달 안의 날은 일자만("15") 표기한다.
      if (day !== prevDay) {
        labels.set(raw, month !== prevMonth ? md(m) : String(day));
      } else {
        labels.set(raw, "");
      }
    } else {
      hasDateOnly = true;
      // 월이 바뀔 때만 "M/D", 그 외엔 일자만.
      labels.set(raw, month !== prevMonth ? md(m) : String(day));
    }
    prevDay = day;
    prevMonth = month;
  }

  const pick = (value: string) => labels.get(value) ?? value;

  // 시간별: 모든 점을 후보로 두되(interval 0) 날짜 경계에만 라벨. 눈금선은 숨겨 깔끔하게.
  if (hasDatetime) {
    return { tickFormatter: pick, interval: 0, tickLine: false };
  }

  if (hasDateOnly) {
    // 점이 많으면 솎아내되, 보이는 눈금마다 월을 붙여 어떤 날짜인지 항상 알 수 있게 한다.
    if (data.length > DENSE_THRESHOLD) {
      const mdOnly = (value: string) => {
        const m = DATE_RE.exec(value);
        return m ? md(m) : value;
      };
      return { tickFormatter: mdOnly, interval: "preserveStartEnd" };
    }
    // 적으면 전부 표시해 날짜 스킵을 없앤다.
    return { tickFormatter: pick, interval: 0 };
  }

  // 시각만(HH:MI 등): 기본 솎아내기.
  return { tickFormatter: pick, interval: "preserveStartEnd" };
}
