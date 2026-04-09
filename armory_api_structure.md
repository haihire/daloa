# 로스트아크 /armories/characters/{name} API 응답 구조

> 샘플 캐릭터: **로아와** (환수사, 카제로스)
> 아이템 평균 레벨: 1,752.50 | 전투력: 4,615.34

---

## 최상위 키 목록

| 키 | 설명 | null 가능 |
|---|---|---|
| ArmoryProfile | 기본 프로필 | N |
| ArmoryEquipment | 장비 목록 (무기~보주) | Y |
| ArmoryAvatars | 아바타 목록 | Y |
| ArmorySkills | 스킬 목록 (트라이포드/룬 포함) | Y |
| ArmoryEngraving | 각인 정보 (아크패시브 여부에 따라 세부 구조 변화) | Y |
| ArmoryCard | 카드세트 정보 | Y |
| ArmoryGem | 보석 목록 및 효과 | Y |
| ArkPassive | 아크패시브 (진화/깨달음/도약 포인트) | Y |
| ArkGrid | 아크그리드 슬롯 정보 | Y |
| ColosseumInfo | 콜로세움 전적 | Y |
| Collectibles | 수집품 현황 | Y |

---

## 1. ArmoryProfile

| 필드 | 타입 | 예시값 | 설명 |
|---|---|---|---|
| CharacterName | string | 로아와 | 캐릭터명 |
| ServerName | string | 카제로스 | 서버명 |
| CharacterLevel | int | 70 | 전투 레벨 |
| CharacterClassName | string | 환수사 | 직업명 |
| ItemAvgLevel | string | 1,752.50 | 아이템 평균 레벨 (**쉼표 포함 문자열** - float 변환 필요) |
| ExpeditionLevel | int | 400 | 원정대 레벨 |
| CombatPower | string | 4,615.34 | 전투력 (쉼표 포함 문자열) |
| GuildName | string\|null | 신고 | 길드명 |
| Title | string\|null | <img src='emoticon_Kazeroth_firstevent_4' size='130' vspace='-7'></img>심연의 군주 | 칭호 |
| UsingSkillPoint | int | 482 | 사용 스킬포인트 |
| TotalSkillPoint | int | 483 | 전체 스킬포인트 |
| CharacterImage | string\|null | (URL) | 캐릭터 이미지 URL |

### Stats (전투 특성)

| Type | Value |
|---|---|
| 치명 | 848 |
| 특화 | 75 |
| 제압 | 79 |
| 신속 | 1577 |
| 인내 | 71 |
| 숙련 | 75 |
| 최대 생명력 | 356464 |
| 공격력 | 183322 |

---

## 2. ArmoryEquipment

각 아이템 공통 필드: `Type`, `Name`, `Icon` (URL), `Grade`, `Tooltip` (JSON 문자열)

**Tooltip 파싱 구조**: Tooltip은 JSON 문자열로, `Element_000`, `Element_001` ... 형태의 키를 가짐
- `type: "ItemTitle"` → `qualityValue` (품질 0~100)
- `type: "IndentStringGroup"` → 재련, 각인 효과, 아크포인트 효과 등
- `type: "SingleTextBox"` → 연마/기타 텍스트

| Type | Name | Grade | 비고 |
|---|---|---|---|
| 무기 | +21 운명의 전율 두루마리 | 고대 | 품질 100 |
| 투구 | +15 운명의 전율 머리장식 | 고대 | 품질 100 |
| 상의 | +14 운명의 전율 상의 | 고대 | 품질 99 |
| 하의 | +14 운명의 전율 하의 | 고대 | 품질 98 |
| 장갑 | +15 운명의 전율 장갑 | 고대 | 품질 99 |
| 어깨 | +14 운명의 전율 어깨장식 | 고대 | 품질 100 |
| 목걸이 | 도래한 결전의 목걸이 | 고대 | 품질 95 |
| 귀걸이 | 도래한 결전의 귀걸이 | 고대 | 품질 82 |
| 귀걸이 | 도래한 결전의 귀걸이 | 고대 | 품질 88 |
| 반지 | 도래한 결전의 반지 | 고대 | 품질 77 |
| 반지 | 도래한 결전의 반지 | 고대 | 품질 76 |
| 어빌리티 스톤 | 위대한 비상의 돌 | 고대 | 품질 -1 |
| 팔찌 | 찬란한 구원자의 팔찌 | 고대 | 품질 -1 |
| 나침반 | 특제 성운 나침반 | 유물 | 품질 -1 |
| 부적 | 광휘의 별무리 부적 | 유물 | 품질 -1 |
| 문장 | 백금 용사의 문장 | 유물 | 품질 -1 |
| 보주 | 신비로운 투영의 보주 | 유물 | 품질 -1 |

---

## 3. ArmorySkills

각 스킬 필드:

| 필드 | 타입 | 설명 |
|---|---|---|
| Name | string | 스킬명 |
| Icon | string | 아이콘 URL |
| Level | int | 스킬 레벨 (1~12) |
| Type | string | 스킬 타입 (예: "일반", "이동기") |
| SkillType | int | 0=일반 스킬, 기타 |
| Tripods | array | 트라이포드 목록 (최대 9개: 3티어 × 3선택지) |
| Rune | object\|null | 룬 정보 |
| Tooltip | string | 스킬 설명 JSON 문자열 |

### Tripods[] 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| Tier | int | 트라이포드 티어 (0=1티어, 1=2티어, 2=3티어) |
| Slot | int | 같은 티어 내 선택지 번호 (1~3) |
| Name | string | 트라이포드명 |
| Icon | string | 아이콘 URL |
| IsSelected | bool | 현재 선택 여부 |
| Tooltip | string | 효과 설명 HTML 문자열 |

### Rune 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| Name | string | 룬명 |
| Icon | string | 아이콘 URL |
| Grade | string | 등급 (일반/희귀/영웅/전설/유물) |
| Tooltip | string | 효과 설명 |

### 스킬 예시 (실제 데이터)

| 스킬명 | Lv | Type | 트라이포드(선택 중) | 룬 |
|---|---|---|---|---|
| 할퀴기 | 7 | 일반 | T1: 우직함, T2: 돌진 | 속행 |
| 데굴방아 | 10 | 일반 | T1: 갑옷 파괴, T2: 환영 돌진, T3: 가시 바위 | 속행 |
| 마구 쪼기 | 14 | 일반 | T1: 지속력 강화, T2: 예리한 일격, T3: 어둠의 영역 | 속행 |
| 빙글빙글 꽝 | 14 | 일반 | T1: 뇌진탕, T2: 야수의 보호, T3: 혼연일체 | 비전 |
| 여우 불꽃 | 14 | 일반 | T1: 마력 조절, T2: 환수 변환, T3: 푸른 번개 | 비전 |
| 여우 폴짝 | 11 | 지점 | T1: 뇌진탕, T2: 환수 변환, T3: 날카로운 이빨 | 집중 |
| 슈웅 곰 | 14 | 차지 | T1: 뇌진탕, T2: 환수 변환, T3: 무쇠 포탄 | 압도 |
| 바위 곰 | 14 | 지점 | T1: 뇌진탕, T2: 대지의 분노, T3: 환수 변환 | 압도 |

---

## 4. ArmoryEngraving

> ⚠️ **아크패시브 적용 구조** (1540+ 캐릭터)
> - `Effects`: **null** (옛 각인 시스템)
> - `Engravings`: **null** (옛 각인서 목록)
> - `ArkPassiveEffects`: **배열** (아크패시브 각인 효과 ← 실제 사용)

> 아크패시브 미적용 구조 (구 시스템):
> - `Effects[]`: 활성화된 각인 효과
> - `Engravings[]`: 각인서 목록

### ArkPassiveEffects[] 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| Name | string | 각인명 |
| Grade | string | 등급 (영웅/유물/고대) |
| Level | int | 각인 레벨 (1~5) |
| AbilityStoneLevel | int\|null | 어빌리티 스톤 부여 레벨 (null이면 서클/각인서 활성) |
| Description | string | 효과 설명 (HTML 태그 포함) |

### 실제 각인 데이터 (로아와)

| Name | Grade | Level | AbilityStoneLevel | Description |
|---|---|---|---|---|
| 원한 | 유물 | 4 | null | 보스 및 레이드 몬스터에게 주는 피해가 21.00% 증가하지만, 받는 피해가 20.00% 증가한다. |
| 돌격대장 | 유물 | 4 | 3 | 이동속도 증가량의 61.20% 만큼 적에게 주는 피해량이 증가한다. |
| 마나 효율 증가 | 유물 | 4 | null | 마나 회복 속도가 20.00% 증가하며, 마나를 사용하는 스킬이 적에게 주는 피해가 16.00% 증가한다. |
| 질량 증가 | 유물 | 4 | null | 공격속도가 10.00% 감소하지만, 적에게 주는 피해가 19.00% 증가한다. |
| 아드레날린 | 유물 | 4 | 1 | 이동기 및 기본공격을 제외한 스킬 사용 후 6초 동안 공격력이 1.38% 증가하며 (최대 6중첩) 해당 효과가 최대 중첩 도달 시 치명타 적중률 |

---

## 5. ArmoryCard

### Cards[] 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| Slot | int | 슬롯 번호 (0~5) |
| Name | string | 카드명 |
| Icon | string | 아이콘 URL |
| Grade | string | 등급 |
| AwakeCount | int | 현재 각성 횟수 |
| AwakeTotal | int | 최대 각성 횟수 |

### 실제 카드 데이터

| Slot | Name | Grade | AwakeCount | AwakeTotal |
|---|---|---|---|---|
| 0 | 샨디 | 전설 | 5 | 5 |
| 1 | 아제나&이난나 | 전설 | 5 | 5 |
| 2 | 니나브 | 전설 | 5 | 5 |
| 3 | 카단 | 전설 | 5 | 5 |
| 4 | 바훈투르 | 전설 | 5 | 5 |
| 5 | 실리안 | 전설 | 5 | 5 |

### Effects[] (카드세트 효과)

| 필드 | 타입 | 설명 |
|---|---|---|
| Index | int | 세트 인덱스 |
| CardSlots | string | 사용된 슬롯 번호들 (쉼표 구분) |
| Items[].Name | string | 세트 효과명 |
| Items[].Description | string | 효과 설명 |

| Index | CardSlots | 세트 효과 |
|---|---|---|
| 0 | 0,1,2,3,4,5 | 세상을 구하는 빛 2세트 / 세상을 구하는 빛 4세트 / 세상을 구하는 빛 6세트 / 세상을 구하는 빛 6세트 (12각성합계) / 세상을 구하는 빛 6세트 (18각성합계) / 세상을 구하는 빛 6세트 (24각성합계) / 세상을 구하는 빛 6세트 (30각성합계) |

---

## 6. ArmoryGem

### Gems[] 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| Slot | int | 보석 슬롯 번호 (0~10) |
| Name | string | 보석명 (**HTML 태그 포함** - 파싱 필요) |
| Icon | string | 아이콘 URL |
| Level | int | 보석 레벨 (1~10) |
| Grade | string | 등급 |
| Tooltip | string | 상세 정보 JSON |

### 실제 보석 데이터

| Slot | Level | Grade | Name (HTML 제거) |
|---|---|---|---|
| 0 | 8 | 유물 | 8레벨 광휘의 보석 |
| 1 | 8 | 유물 | 8레벨 광휘의 보석 |
| 2 | 8 | 유물 | 8레벨 광휘의 보석 |
| 3 | 8 | 유물 | 8레벨 광휘의 보석 |
| 4 | 8 | 유물 | 8레벨 광휘의 보석 |
| 5 | 8 | 유물 | 8레벨 광휘의 보석 |
| 6 | 8 | 유물 | 8레벨 광휘의 보석 |
| 7 | 8 | 유물 | 8레벨 광휘의 보석 |
| 8 | 8 | 유물 | 8레벨 광휘의 보석 |
| 9 | 8 | 유물 | 8레벨 광휘의 보석 |
| 10 | 8 | 유물 | 8레벨 광휘의 보석 |

### Effects 구조

> ⚠️ `ArmoryGem.Effects`는 **배열이 아닌 객체**: `{ Description: string, Skills: array }`

| 필드 | 타입 | 설명 |
|---|---|---|
| Effects.Description | string | 전체 요약 (HTML 포함) |
| Effects.Skills[] | array | 보석 효과 상세 목록 |
| Effects.Skills[].GemSlot | int | 해당 보석 슬롯 번호 |
| Effects.Skills[].Name | string | 영향받는 스킬명 |
| Effects.Skills[].Description | array | 효과 설명 문자열 배열 |
| Effects.Skills[].Option | string | 부가 효과 (기본 공격력 증가 등) |
| Effects.Skills[].Icon | string | 스킬 아이콘 URL |

### 실제 보석 효과 데이터

| GemSlot | SkillName | Description |
|---|---|---|
| 0 | 마구 쪼기 | 피해 36.00% 증가 |
| 1 | 마구 쪼기 | 재사용 대기시간 20.00% 감소 |
| 2 | 빙글빙글 꽝 | 피해 36.00% 증가 |
| 3 | 빙글빙글 꽝 | 재사용 대기시간 20.00% 감소 |
| 9 | 슈웅 곰 | 피해 36.00% 증가 |
| 10 | 슈웅 곰 | 재사용 대기시간 20.00% 감소 |
| 7 | 바위 곰 | 피해 36.00% 증가 |
| 8 | 바위 곰 | 재사용 대기시간 20.00% 감소 |
| 6 | 여우 폴짝 | 피해 36.00% 증가 |
| 4 | 여우 불꽃 | 피해 36.00% 증가 |
| 5 | 여우 불꽃 | 재사용 대기시간 20.00% 감소 |

---

## 7. ArkPassive

| 필드 | 타입 | 설명 |
|---|---|---|
| IsArkPassive | bool | 아크패시브 적용 여부 |
| Title | string | **직업 소분류 칭호** (class_detail 판별 핵심) |
| Points | array | 진화/깨달음/도약 포인트 |
| Effects | array | 획득한 아크패시브 효과 목록 |

- **IsArkPassive**: true
- **Title**: `환수 각성` ← **class_detail 판별에 가장 직접적**

### Points[]

| 필드 | 타입 | 설명 |
|---|---|---|
| Name | string | 포인트 종류 (진화/깨달음/도약) |
| Value | int | 현재 포인트 합산값 |
| Description | string | 랭크/레벨 설명 |

| Name | Value | Description |
|---|---|---|
| 진화 | 140 | 6랭크 21레벨 |
| 깨달음 | 101 | 6랭크 24레벨 |
| 도약 | 70 | 6랭크 21레벨 |

### Effects[]

| 필드 | 타입 | 설명 |
|---|---|---|
| Name | string | 효과 구분 (진화/깨달음/도약) |
| Description | string | 세부 효과명 및 레벨 |

| Name | Description |
|---|---|
| 깨달음 | 깨달음 1티어 환수 각성 Lv.1 |
| 깨달음 | 깨달음 2티어 활기 Lv.3 |
| 깨달음 | 깨달음 3티어 환수의 정기 Lv.3 |
| 깨달음 | 깨달음 3티어 천부적 재능 Lv.2 |
| 깨달음 | 깨달음 4티어 날렵한 걸음걸이 Lv.3 |
| 진화 | 진화 1티어 치명 Lv.10 |
| 진화 | 진화 1티어 신속 Lv.30 |
| 진화 | 진화 2티어 금단의 주문 Lv.1 |
| 진화 | 진화 2티어 한계 돌파 Lv.2 |
| 진화 | 진화 3티어 무한한 마력 Lv.2 |
| 진화 | 진화 4티어 회심 Lv.1 |
| 진화 | 진화 4티어 달인 Lv.1 |
| 진화 | 진화 5티어 마나 용광로 Lv.2 |
| 도약 | 도약 1티어 풀려난 힘 Lv.5 |
| 도약 | 도약 1티어 잠재력 해방 Lv.4 |
| 도약 | 도약 1티어 즉각적인 주문 Lv.2 |
| 도약 | 도약 2티어 결속 강화 Lv.3 |

---

## 8. ArkGrid

> 직업 전용 코어명 → 빌드(딜형/지원형) 판별에 활용

### Slots[] 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| Index | int | 슬롯 인덱스 (0부터) |
| Name | string | 코어명 (예: "질서의 해 코어 : 피니셔") |
| Point | int | 해당 코어에 투자된 포인트 |
| Tooltip | string | 코어 상세 효과 JSON |

### 실제 슬롯 데이터

| Index | Name | Point |
|---|---|---|
| 0 | 혼돈의 달 코어 : 흡수의 일격 | 19 |
| 1 | 질서의 달 코어 : 까마귀 내려온다 | 17 |
| 2 | 질서의 별 코어 : 환영 곰 | 19 |
| 3 | 혼돈의 별 코어 : 무기 | 18 |
| 4 | 질서의 해 코어 : 무한 각성 | 17 |
| 5 | 혼돈의 해 코어 : 현란한 공격 | 18 |

---

## 9. ArmoryAvatars

| 필드 | 타입 | 설명 |
|---|---|---|
| Type | string | 부위명 (무기 아바타, 상의 아바타 등) |
| Name | string | 아바타명 |
| Icon | string | 아이콘 URL |
| Grade | string | 등급 |
| IsSet | bool | 세트 여부 |
| IsInner | bool | 이너 아바타 여부 |

### 실제 아바타 데이터

| Type | Name | Grade | IsSet | IsInner |
|---|---|---|---|---|
| 무기 아바타 | 환상의 영원 두루마리 (귀속) | 전설 | false | true |
| 머리 아바타 | 환상의 영원 머리 (귀속) | 전설 | false | true |
| 상의 아바타 | 환상의 영원 상의 (귀속) | 전설 | false | true |
| 하의 아바타 | 환상의 영원 하의 (귀속) | 전설 | false | true |
| 얼굴1 아바타 | 7주년 궤적 얼굴1 (이벤트) | 영웅 | false | false |
| 얼굴2 아바타 | 7주년 궤적 얼굴2 (이벤트) | 영웅 | false | false |
| 무기 아바타 | 7주년 궤적 두루마리 (이벤트) | 영웅 | false | false |
| 머리 아바타 | 7주년 궤적 머리 (이벤트) | 영웅 | false | false |
| 상의 아바타 | 7주년 궤적 상하의 (이벤트) | 영웅 | true | false |
| 이동 효과 | 달콤 호빵 이동 효과 | 영웅 | false | false |
| 변신 스킨 | 봉제 인형 뭉이 | 영웅 | false | false |

---

## 10. ColosseumInfo

| 필드 | 타입 | 설명 |
|---|---|---|
| Rank | int | 현재 시즌 랭크 |
| PreRank | int | 이전 시즌 랭크 |
| WinCount | int\|null | 승리 횟수 |
| LoseCount | int\|null | 패배 횟수 |
| TieCount | int\|null | 무승부 횟수 |
| ColosseumInfo | object\|null | 각 모드별 세부 전적 (키가 있을 경우) |

| 필드 | 값 |
|---|---|
| Rank | 0 |
| PreRank | 0 |
| WinCount | null |
| LoseCount | null |
| TieCount | null |

---

## 11. Collectibles

| 필드 | 타입 | 설명 |
|---|---|---|
| Type | string | 수집품 종류 |
| Point | int | 현재 수집 수량 |
| MaxPoint | int | 최대 수량 |
| Icon | string | 아이콘 URL |

| Type | Point | MaxPoint |
|---|---|---|
| 모코코 씨앗 | 1480 | 1480 |
| 섬의 마음 | 103 | 104 |
| 위대한 미술품 | 60 | 60 |
| 거인의 심장 | 15 | 15 |
| 이그네아의 징표 | 20 | 20 |
| 항해 모험물 | 46 | 50 |
| 세계수의 잎 | 120 | 120 |
| 오르페우스의 별 | 10 | 10 |
| 기억의 오르골 | 20 | 20 |
| 크림스네일의 해도 | 2 | 2 |
| 누크만의 환영석 | 6 | 12 |

---

## 정리: loa_users 저장 시 추출 경로

| DB 컬럼 | API 경로 | 가공 방법 |
|---|---|---|
| server | ArmoryProfile.ServerName | 그대로 |
| level | ArmoryProfile.ItemAvgLevel | 쉼표 제거 후 parseFloat |
| class | ArmoryProfile.CharacterClassName | 그대로 |
| class_detail | ArkPassive.Title | 그대로 (아크패시브 적용 시) |
| thesix | (원정대 내 순위 계산) | siblings API ItemAvgLevel 기준 상위 6명 = 1 |

### 추가 수집 가능 필드 (확장 시)

| 항목 | 경로 |
|---|---|
| 전투력 | ArmoryProfile.CombatPower |
| 특화 수치 | ArmoryProfile.Stats[] Type="특화" Value |
| 치명 수치 | ArmoryProfile.Stats[] Type="치명" Value |
| 신속 수치 | ArmoryProfile.Stats[] Type="신속" Value |
| 아크패시브 진화 포인트 | ArkPassive.Points[] Name="진화" Value |
| 각인 목록 | ArmoryEngraving.ArkPassiveEffects[].Name + Level |
| 보석 평균 레벨 | ArmoryGem.Gems[].Level 평균 |
| 카드 세트 | ArmoryCard.Effects[].Items[].Name |

> **Notes**
> - `ArkPassive.Title`이 null이면 아크패시브 미적용 캐릭터 → `Engravings`에서 각인 추출
> - Gem.Name에 HTML 태그 포함 → 반드시 파싱 필요
> - Tooltip 필드들은 모두 JSON 문자열 embedded → 필요 시 파싱