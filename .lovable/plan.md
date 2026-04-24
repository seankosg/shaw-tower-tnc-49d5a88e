

## Defect Dashboard 2단계 구조 — UI 미리보기

### 화면 전체 구조 (위→아래)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Header: Defect Executive Dashboard          [Team▼] [DateRange] [.xlsx]│
├────────────────────────────────────────────────────────────────────────┤
│ KPI 카드 6장 (1행)                                                     │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┐                           │
│ │Total │Comp. │Closure│ Diff │Overall│Overdue│                         │
│ │Defect│ Done │ Done │ (대기)│ Prog. │       │                         │
│ └──────┴──────┴──────┴──────┴──────┴──────┘                           │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 카드 2장 (1행, md:grid-cols-2)                                   │
│ ┌─────────────────────────┬─────────────────────────┐                  │
│ │ Completion              │ Closure                 │                  │
│ │  120 / 200  ●●●○○ 60%   │  85 / 200  ●●○○○ 42.5%  │                 │
│ │  Overdue: 8             │  Overdue: 14            │                  │
│ └─────────────────────────┴─────────────────────────┘                  │
├────────────────────────────────────────────────────────────────────────┤
│ Alert Banner (Overdue / At-Risk)                                       │
├────────────────────────────────────────────────────────────────────────┤
│ Plan vs Actual Summary  [By Sub Trade│Subcon│Sub-Sub│PIC│Team│WorkType]│
│  ※ 그룹당 3행: Completion / Closure / Difference                       │
├────────────────────────────────────────────────────────────────────────┤
│ S-Curve Chart  (Completion / Closure 2계열만 — Start 제거)             │
├────────────────────────────────────────────────────────────────────────┤
│ Top 10 Overdue Table   |   Status Distribution Pie                     │
└────────────────────────────────────────────────────────────────────────┘
```

### KPI 카드 6장 상세

```text
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ 📋 Total    │ ✅ Comp.    │ 🛡 Closure  │ ⏳ Diff     │ 📈 Overall  │ 🚨 Overdue  │
│   Defects   │    Done     │    Done     │ (검측대기)  │  Progress   │             │
│             │             │             │             │             │             │
│    200      │    120      │     85      │     35      │   42.5%     │     14      │
│             │  60.0% comp │ 42.5% closed│ 적체 건수   │ closure base│ 누적 지연   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
   click→        click→        click→        click→        —            click→
   raw-data    actualComp=t  closureComp=t actualComp=t                 overdue=t
                                          &closureComp=f
```

### Plan vs Actual Summary — 그룹당 3행 구조

```text
By Sub Trade 탭 예시 (헤더는 17열, 일부만 표시)

┌─────────────┬──────┬─────────────────┬──────────────────────────┬──────────────────────────┬──────┐
│ Sub Trade   │ Total│ Done│Remain│Pct │ Cum  Cum  Δ              │ Today                    │Prog. │
│             │      │     │      │    │ Plan Act                  │ Plan Act Δ Delay         │  %   │
├─────────────┼──────┼─────┼──────┼────┼──────────────────────────┼──────────────────────────┼──────┤
│ Painting    │  60  │     │      │    │                           │                          │      │
│  Completion │      │ 40  │  20  │66% │  45   40   -5             │   3    2  -1   1         │ 66%  │
│  Closure    │      │ 28  │  32  │46% │  35   28   -7             │   2    1  -1   1         │ 46%  │
│  Difference │      │ 12  │  —   │ —  │  10   12   +2 ← 검측 적체 │   1    1   0   0         │  —   │
├─────────────┼──────┼─────┼──────┼────┼──────────────────────────┼──────────────────────────┼──────┤
│ Tiling      │  50  │ ... │      │    │                           │                          │      │
│  Completion │      │ 38  │  12  │76% │  35   38   +3 ← 빠름      │   2    3  +1   0         │ 76%  │
│  Closure    │      │ 30  │  20  │60% │  28   30   +2             │   2    2   0   0         │ 60%  │
│  Difference │      │  8  │  —   │ —  │   7    8   +1             │   0    1  +1   0         │  —   │
└─────────────┴──────┴─────┴──────┴────┴──────────────────────────┴──────────────────────────┴──────┘

색상 약속:
  Completion 행 → 기존 amber/orange 톤 유지
  Closure    행 → 기존 emerald/green 톤 유지
  Difference 행 → 회색 점선 보더 + 회색 배경 (보조 지표 시각)

행 클릭 동작:
  Completion → /defects/raw-data?subTrade=Painting&actualComplete=true
  Closure    → /defects/raw-data?subTrade=Painting&closureComplete=true
  Difference → /defects/raw-data?subTrade=Painting&actualComplete=true&closureComplete=false
                (= 검측 대기 = Comp 됐지만 Closure 미완)
```

### Difference 행 계산 규칙 (한눈에)

```text
Difference 의미 = "Completion은 끝났는데 Closure가 안 된" 검측 대기 건

컬럼            계산
──────────────  ───────────────────────────────────────────────
Total           row.totalDefects (그룹 총건수)
Done            comp.cumActual − closure.cumActual
Remain          —  (의미 약함, 빈 표시)
Pct             —
Cum Plan        comp.cumPlan   − closure.cumPlan
Cum Actual      comp.cumActual − closure.cumActual
Cum Δ           Cum Actual − Cum Plan
                 양수 = 검측 적체 (빨강)
                 음수 = 검측 빠름 (초록)
DataDate Plan   comp.dataDatePlan   − closure.dataDatePlan
DataDate Act    comp.dataDateActual − closure.dataDateActual
DataDate Δ      Act − Plan
DataDate Delay  max(0, comp.dataDateDelay − closure.dataDateDelay)
Today Plan/Act/Δ/Delay  동일 방식
Progress %      —  (Closure 카드/행에서 확인)
```

### Stage Card 2장

```text
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Completion                  │  │ Closure                     │
│ ─────────────────────────── │  │ ─────────────────────────── │
│  120 / 200                  │  │   85 / 200                  │
│  Remaining: 80              │  │   Remaining: 115            │
│  ████████░░░░  60.0%        │  │   █████░░░░░░  42.5%        │
│  ⚠ Overdue: 8               │  │   ⚠ Overdue: 14             │
└─────────────────────────────┘  └─────────────────────────────┘
   click→raw-data?actualComplete=false   click→raw-data?closureComplete=false
```

### S-Curve 차트 (Start 제거)

```text
누적 라인 4개 + 막대 8개 (스택 2그룹)

  Completion Plan  (dashed)   Completion Actual  (solid)
  Closure    Plan  (dashed)   Closure    Actual  (solid)

  Bars (per bucket):
    Completion: Met / Shortfall / Excess / FuturePlan
    Closure   : Met / Shortfall / Excess / FuturePlan
```

### 변경 요약

```text
- KPI: SubTrades / Start 카드 제거 → Difference 카드 추가
- Stage Card: 3장 → 2장 (Start 제거)
- Plan vs Actual: Start/Comp/Closure → Comp/Closure/Difference
- S-Curve: Start 시리즈 제거
- 모든 Diff 셀은 클릭 시 actualComplete=true & closureComplete=false 필터로 이동
```

