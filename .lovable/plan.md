
# Punch Dashboard 최상단 재설계 — 진도율 + 우려사항 중심

## 목적

현재 14개의 작은 숫자 KPI 카드가 2줄로 나열되어 있어 "지금 얼마나 진행됐고 어디가 걱정인가"를 한눈에 읽기 어렵다. 숫자만 잔뜩이고 백분율은 묻혀 있다. TnC 대시보드(`DashboardPage.tsx`)의 Tier 구조를 참고해 **Tier 1: 진도율(%) 중심**, **Tier 2: 지연·우려(건수) 중심**으로 줄이고, 장식용 아이콘은 모두 제거한다.

## 변경 범위

- 파일: `src/pages/PunchDashboardPage.tsx`만 수정
- 데이터/계산 로직(`stats`, `weightedProgress` 등) 변경 없음 — 카드 구성과 시각화만 재배치
- Summary of Work, Pre-Engineering Gates(Detail), Lookahead, Progress Matrix, Recovery 등 하단 섹션은 그대로 유지

## Tier 1 — Progress (진도율, 4 카드)

큰 카드 4개. 각 카드는 **큰 백분율 + 보조 분수/숫자 + 얇은 progress bar** 조합. 아이콘 없음.

```text
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Completion       │ Weighted Actual  │ Weighted Planned │ Variance         │
│  62.4%           │  58.1%           │  64.3%           │  −6.2%           │
│  312 / 500       │  ▓▓▓▓▓▓░░░░ 58%  │  ▓▓▓▓▓▓▓░░░ 64%  │  Actual − Plan   │
│  (progress bar)  │                  │                  │  (red/green)     │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

- **Completion %** — `stats.completed / stats.total` (큰 %, 부제 "312 / 500 items", 클릭 → `completionStatus=Completed`)
- **Weighted Actual %** — `stats.w.actual` (progress bar, emerald)
- **Weighted Planned %** — `stats.w.planned` (progress bar, neutral)
- **Variance** — `stats.w.variance` (큰 +/−%, 양수 emerald / 음수 red, 부제 "Actual vs Planned")

→ 기존 `Total / Completed / WIP / Not Started / Completion% / Weighted Planned / Weighted Actual` 7개 카드를 4개로 통합. WIP/Not Started/Total은 Tier 1.5 mini-strip(아래)으로 강등.

## Tier 1.5 — Status Mix (한 줄, 얇은 stacked bar)

진도 카드 바로 아래 1줄짜리 가로 stacked bar로 상태 구성을 시각화:

```text
Status Mix  ▓▓▓▓▓▓▓▓ Completed 312 (62%)  ▓▓▓▓ WIP 120 (24%)  ▓▓ Not Started 68 (14%)   Total 500
```

- 클릭 가능한 3개 세그먼트(Completed/WIP/Not Started). 색상은 emerald/blue/muted.
- 별도 카드 4개 자리를 1줄로 압축 → 공간 절약 + 비율 직관화.

## Tier 2 — Risk & Delay (우려사항, 4 카드 + % 보조표시)

지연·블로커 관련 카드만 모아 별도 행으로. 각 카드는 **건수 + 전체 대비 %** 동시 표기.

```text
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Overdue          │ Critical Delay   │ Behind Schedule  │ Pre-Eng Blocked  │
│  47   9.4%       │  12   2.4%       │  38   7.6%       │  64   12.8%      │
│  past planned    │  >14d or critical│  health=behind   │  awaiting pre-eng│
│  (red tone)      │  (red tone)      │  (amber tone)    │  (amber tone)    │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

- **Overdue** — `stats.overdue` + `pct(overdue, total)` (red, → `status=overdue`)
- **Critical Delay** — `stats.critical` + % (red, → `health=critical`)
- **Behind Schedule** — `stats.behind` + % (amber, → `health=behind`)
- **Pre-Eng Blocked** — `stats.blocked` + % (amber, → `pre_eng=blocked`)

→ 기존 두 번째 KPI 행의 `Behind / Start Delayed / Due This Week / Ready·Not Started` 등은 이미 하단 **Lookahead** 카드와 중복되므로 Tier 2에서 제거. Start Delayed / Due This Week는 Lookahead 7d 탭에 이미 존재.

## 제거할 요소

1. **Tier 1·2 카드 내부 lucide 아이콘** 전체 삭제 (`Clock`, `CheckCircle2`, `Rocket`, `PauseCircle`, `AlertTriangle`, `Flame`, `ShieldAlert`, `TrendingUp`, `AlertCircle`, `CalendarDays`, `ListChecks`, `GaugeCircle` 등 — Tier KPI 영역에서만)
2. 기존 7+7 = 14개 KPI 카드 그리드 두 줄 → Tier1(4) + Tier1.5(1줄 bar) + Tier2(4) 구조로 교체
3. `KpiCard` 컴포넌트의 `icon` prop은 유지하되 호출부에서 전달하지 않음 (Summary of Work 내부 MetaChip 아이콘은 의미가 있으므로 유지)

## 유지

- Summary of Work 카드(아이콘 포함 MetaChip — 카테고리/Pre-Eng/일정 정보 식별 필수)
- Progress Overview 카드(상세 weighted/avg 분해표시)
- Pre-Engineering Gates(Detail), Lookahead, Progress Matrix, Recovery, Top Delaying Parties, DQ 등 하단 섹션

## 시각 규칙

- 큰 % 값: `text-3xl font-semibold tabular-nums`
- 진도 카드: `bg-card`, subtle border, 4px progress bar
- 우려 카드: 좌측 4px 컬러 스트라이프(red/amber)로 톤 구분 (아이콘 대신)
- 모든 색상은 semantic 토큰(`emerald-600`, `red-600`, `amber-600`은 기존 코드 패턴 유지)

## 구현 메모 (기술)

- `KpiCard` 호출부만 교체 — 컴포넌트 정의는 유지(기존 다른 톤/accent 로직 재활용 가능)
- 필요 시 Tier 1용 `ProgressKpiCard`와 Tier 2용 `RiskKpiCard` 로컬 컴포넌트 신규 추가 (한 파일 내). 둘 다 아이콘 없음.
- Tier 1.5 stacked bar는 `div` flex + width % 만으로 구현 (라이브러리 불필요)
- `lucide-react` import에서 Tier KPI 전용 아이콘 제거(다른 곳에서 쓰이면 유지)
