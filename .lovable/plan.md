# Slide 12 (Punch List) 재디자인 계획 — v2 (일관성 강화)

## 다른 슬라이드의 디자인 DNA (재점검)

슬라이드 2 / 3 / 7 / 10 / 11을 비교하여 공통 패턴 추출:

| 요소 | 공통 규칙 |
|---|---|
| **카드 양식** | 상단 4~6px 색상 stripe + 다크 네이비 본체. 위험 카드는 stripe + **본체 외곽선** 둘 다 magenta로 강조 (슬라이드 3 Test Report, 슬라이드 7 Closure, 슬라이드 10 Closure) |
| **위험 표시 방법** | 별도 "Risk 섹션" 없음. **각 카드 우상단에 작은 `AT RISK` / `Critical` 뱃지** (magenta 배경, 흰 글씨, 모노 caps) |
| **카드 밀도** | 한 슬라이드에 **4 cards 그리드**(2×2 또는 1×4 hero) 또는 **2 cards**(슬라이드 7/10). 8개 카드를 한 슬라이드에 두는 패턴은 없음 |
| **수치 표현** | 큰 숫자 60~120pt + 작은 단위(`%`, `days`) + 보조 라인(`+7.5% vs plan`, green=좋음 / magenta=나쁨) |
| **섹션 헤더** | 좌상단 모노 caps + 자간(`PUNCH LIST`, `DEFECT MANAGEMENT`) + 우상단 보조 라인. **본문 안에 별도의 "PROGRESS"/"RISK" 구분 라벨은 없음** |
| **푸터** | `SHAW · Status Report` (좌) + `Page NN` (우) — `drawFooter()` 공통 |

### v1 계획의 문제점

이전 안(Tier1 4카드 + Status Mix bar + Tier2 4카드 = 카드 8개 + 섹션 라벨 2종)은 **다른 어떤 슬라이드에도 없는 밀도/구조**라 통일감을 해칩니다. 또한 "PROGRESS" / "RISK & DELAY" 섹션 라벨은 본 PPT 디자인 언어에 없습니다.

## 신규 레이아웃 (슬라이드 3/7 hero + 슬라이드 11 list-card 패턴 결합)

```text
┌─ PUNCH LIST                      SC · Substantial Completion · 15-Jun-2026 ─┐
│                                                                              │
│  Headline (데이터 기반, 26pt bold, 1줄)                                       │
│                                                                              │
│  ┌─ Hero row · 3 cards (slide 3/7 style, 큰 % + 우상단 뱃지) ───────────┐    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Completion   │  │ Weighted Act │  │ Beyond SC    │ AT RISK ←뱃지  │    │
│  │  │              │  │              │  │              │                │    │
│  │  │  2.3 %       │  │  4.5 %       │  │    25        │                │    │
│  │  │              │  │              │  │              │                │    │
│  │  │ 2 / 86 items │  │ vs 31.2% pln │  │ scope review │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  │    green stripe     green stripe     magenta stripe + magenta outline │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─ Detail row · 2 list cards (slide 11 패턴, 미니 bar + 카운트) ─────┐      │
│  │  ┌─ Status Mix ─────────────┐  ┌─ Risk Watch ──────────────┐      │      │
│  │  │ Completed     2  (2%)    │  │ Pre-Eng Blocked   N  (x%) │      │      │
│  │  │ In Progress  22 (26%)    │  │ Overdue           N  (x%) │      │      │
│  │  │ Not Started  62 (72%)    │  │ Critical Delay    N  (x%) │      │      │
│  │  │ cyan stripe              │  │ magenta stripe            │      │      │
│  │  └──────────────────────────┘  └───────────────────────────┘      │      │
│  └────────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│  TOP 3 LATEST · Beyond SC · Scope Review Required                           │
│  1   item_no   description ………………………   discipline      30-Sep-2026          │
│  2   …                                                                      │
│  3   …                                                                      │
│                                                                              │
│  SHAW · Status Report                                            Page 12    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 일관성 매핑

| 새 슬라이드 12 요소 | 참조 슬라이드 | 동일 시각 요소 |
|---|---|---|
| Hero 3 cards | 슬라이드 3 (T&C Snapshot) | stripe + 큰 % + AT RISK 뱃지 + magenta outline |
| Status Mix list card | 슬라이드 11 ABD 카드 | 라벨 + 우측 카운트(또는 %) + 얇은 progress bar |
| Risk Watch list card | 슬라이드 11 Warranty 카드 | 동일 list-row 패턴 |
| TOP 3 LATEST 테이블 | 현행 슬라이드 12 유지 | 잔존 (가독성 검증된 요소) |
| 헤더/푸터/배경 | 모든 슬라이드 | `C.bgBody`, `FONT`, `FONT_MONO`, `drawFooter()` |

### 표현 규칙

- **% / 카운트 균형**: Hero는 % 중심(Completion %, Weighted Actual %), 카운트가 더 직관적인 Beyond SC만 숫자. List 카드는 "카운트 (백분율)" 병기.
- **위험 뱃지 조건 (자동)**:
  - Completion < 5% 또는 variance < −20% → Completion 카드에 `AT RISK`
  - beyondSc > 0 → Beyond SC 카드에 `AT RISK` + magenta outline
  - 모두 정상이면 뱃지 없음
- **빈 데이터 처리**: TOP 3가 0개일 때 placeholder 행 3개(현행 동작 유지). Beyond SC = 0이면 카드 자체는 표시하되 뱃지 제거, 본문 "all within SC"로 대체.

## 기술 세부사항

### 1. 데이터 확장 — `src/lib/report-builder.ts`

**A. `fetchPunch()` 컬럼 확장**: `select('*')` 로 변경 → row가 `PunchItem`과 호환되어 `punch-dashboard-utils` 헬퍼 직접 사용 가능.

**B. `PunchReportData`에 신규 필드 추가**:
```ts
progressKpi?: {
  completionPct: number;        // 단순: completed / total
  weightedActualPct: number;
  weightedPlannedPct: number;
};
riskKpi?: {
  blocked: number;              // isBlockedByPreEng
  overdue: number;              // isCompletionOverdue
  criticalDelay: number;        // isCriticalDelay (>14d or health=critical)
};
```

**C. `computePunchData()` 보강**: `weightedProgress`, `isCompletionOverdue`, `isCriticalDelay`, `isBlockedByPreEng` import 후 채워 넣기.

### 2. `PunchKPI` 인터페이스 + `loadKPIs()` — `src/lib/ppt-builder.ts` (line 122-132, 292-303)

신규 필드(`progressKpi`, `riskKpi`) 매핑 추가.

### 3. `buildPunchSnapshot()` 재작성 — `src/lib/ppt-builder.ts` (line 1132-1287)

기존 본문 모두 교체(타임라인 + 3 status cards 제거):

- **Hero row (3 cards)**: 슬라이드 3의 카드 헬퍼 패턴을 인라인으로 재현 — stripe shape + body shape(위험 시 line color magenta) + label / 큰 숫자 / 단위 / sub-text. 우상단 `AT RISK` 뱃지는 `magentaBright` 배경 rect + 흰 caps.
- **Detail row (2 list cards)**: 슬라이드 11의 `addText` + 얇은 progress bar(`addShape rect`) 조합을 그대로 모방. 각 행 = 라벨(좌) + 카운트 (우) + 0.05" 높이 bar.
- **TOP 3 LATEST**: 현행 코드 유지(좌표만 신규 레이아웃에 맞게 재계산).
- 좌우 여백 0.5", 13.33×7.5 슬라이드 그리드. 카드 행간 0.25". 총 콘텐츠 높이 ≤ 6.7" (footer 0.4" 확보).

### 4. 검증

- 빌드 통과 확인
- 리포트 탭에서 PPT 재생성 → libreoffice로 PDF 변환 → 슬라이드 12 이미지 QA
  - 슬라이드 11과 12를 나란히 비교: 카드 stripe 두께/색/카드 배경/라벨 폰트가 동일한지
  - 슬라이드 3과 12 Hero 카드 비교: 큰 % 표기 + AT RISK 뱃지가 같은 시각 무게인지
  - 텍스트 오버플로, 푸터 위치, 색 대비, magenta outline 조건부 동작 확인
- TOP 3 LATEST 0개 / Beyond SC 0개 케이스 모두 점검

## 영향 받지 않는 영역

- 다른 슬라이드(1~11, 13+), Punch Dashboard 페이지, DB, RLS, Edge Function — 변경 없음
- 텍스트 토큰(`T('punch_snapshot', 'headline', ...)`) — 동일 키 유지, 새 카드 라벨/뱃지에도 토큰 키 추가
- 슬라이드 등록(slide-registry, number 12) — 변경 없음
