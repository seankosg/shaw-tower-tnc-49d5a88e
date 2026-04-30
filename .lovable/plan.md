## Goal

Defect Dashboard의 **Plan vs Actual — S-Curve** 차트를 **계획 대비 실적 및 차이(Variance)** 관리가 핵심 목적임을 반영하도록 재디자인하고, **Progress 탭과 동일한 Group / Team / Bucket / Stage 토글 필터**를 S-Curve에 추가해 두 화면이 동일 기준으로 연동되도록 합니다.

## 현재 진단

S-Curve 현재 구현의 한계:

1. **시각적 우선순위가 모호** — Plan(누적), Actual(누적), Met/Shortfall/Excess/FuturePlan bar 등 12개 시리즈가 한 차트에 동시 표출되어 "차이"가 한눈에 들어오지 않음.
2. **Stage 선택 불가** — Completion과 Closure가 항상 함께 그려져, Start 단계나 특정 stage만 보고 싶을 때 불가능.
3. **그룹 분해 불가** — 전체 합산 곡선만 표시되어 어느 Team/Sub Trade가 지연을 유발하는지 알 수 없음.
4. **필터 불일치** — Progress 탭의 Group/Team/Bucket/Stage 필터와 별개 동작 → 두 페이지를 오갈 때 기준이 끊김.
5. **Variance 미표시** — Plan과 Actual 간 차이를 별도 지표/시각화로 강조하지 않음.

## 제안 디자인

### 1. 차트 구성 — 3-zone 레이아웃 (Variance 중심)

```text
┌─────────────────────────────────────────────────────────────┐
│  Plan vs Actual — S-Curve            [Stage: Comp ▼]        │
│                                       [Group · Team · Bucket]│
├─────────────────────────────────────────────────────────────┤
│  KPI strip:                                                  │
│   Plan(cum) 1,240   Actual(cum) 1,083   Δ -157 (-12.7%)      │
│   Today: 30 Apr 2026   Window: 15 Apr ~ 07 Jun               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   [Main chart] Cumulative Plan vs Actual (선)                │
│     · Plan:    dashed line                                   │
│     · Actual:  solid line, today 이후는 끊어짐               │
│     · Today:   세로 reference line                           │
│     · Group 분해 시: 각 그룹별 색상 line (최대 8개)          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│   [Variance subchart] Δ = Actual - Plan (막대)               │
│     · 음수(빨강) = 지연, 양수(녹색) = 초과 달성              │
│     · today 이후 그레이 = "Plan ahead" (예정 물량)           │
└─────────────────────────────────────────────────────────────┘
```

핵심 포인트:
- **메인 차트는 누적 plan vs actual 라인만** — 시각적으로 가장 중요한 "벌어진 갭"을 즉시 인지 가능.
- **하단 보조 차트가 Variance bar** — 어느 시점부터 갭이 벌어졌는지/회복됐는지 한눈에 파악.
- **상단 KPI strip** — Plan(cum), Actual(cum), Δ(절댓값+%), 기간 정보를 차트 위에 고정 표시.
- **Today reference line** 양 차트에 동기화.

### 2. Stage 단일 선택 (Completion / Closure / Start)

Progress 탭과 달리 S-Curve는 **한 번에 한 stage만** 그리는 것이 가독성에 유리합니다.
이유: stage별로 곡선의 의미와 척도가 달라 겹쳐 그리면 비교가 어렵습니다.

토글:
- **Start** — 착공 plan vs actual
- **Comp** — 완료 plan vs actual (기본값)
- **Close** — 종결 plan vs actual

(Progress 탭에서는 multi-select이지만, S-Curve에서는 single-select로 운용 — 단 토글 UI 외형은 Progress와 동일)

### 3. Group 분해

- **Group: 단일 차원 single-select** (Progress의 multi-select와 차별화)
  - 'All (no breakdown)' 기본값 — 전체 단일 곡선
  - 선택 시 해당 차원의 상위 N개(기본 8) 그룹별로 plan/actual 곡선 분리
  - 9번째 이후는 "Others"로 묶음
- 너무 많은 라인이 그려지면 차트가 무의미해지므로 N=8 상한 적용.
- Group 선택 시 메인 차트는 그룹별 plan(점선) + actual(실선) — 같은 색상으로 짝지어 표시.

### 4. Team 필터

- Progress 탭과 동일한 Select (All / 각 Team)
- 동일한 `team` 쿼리 파라미터 공유 → 두 페이지에서 자동 연동.

### 5. Bucket 필터

- Day / Week 토글 (Progress 탭과 동일 외형)
- 동일한 `bucket` 쿼리 파라미터 공유.

### 6. URL 쿼리 파라미터 통합

S-Curve와 Progress 탭이 같은 키를 공유하도록 합니다:

| 파라미터 | Progress | S-Curve | 비고 |
|---|---|---|---|
| `team` | ✓ | ✓ | 완전 공유 |
| `bucket` | ✓ | ✓ | 완전 공유 |
| `stage_view` | multi (`start,completion,closure`) | single (`completion`) | 형식 호환, S-Curve는 첫 값 사용 |
| `group` | multi | single | S-Curve는 첫 값 사용; `none` = no breakdown |
| `scurve_start` | — | ✓ | 기존 유지 |
| `scurve_end` | — | ✓ | 기존 유지 |

→ Dashboard에서 Team을 'PE2'로 설정 후 Progress 탭으로 이동 시 동일 Team이 적용된 상태로 진입.

### 7. 인터랙션

- **차트 클릭**: 특정 bucket bar 또는 line point 클릭 시 해당 기간/stage의 Defect 목록(Raw Data)으로 이동
  - 쿼리: `dateField` + `dateFrom`/`dateTo` (Progress 탭의 `goRaw` 패턴 그대로 재사용)
- **Legend 클릭**: 그룹 라인 토글 표시/숨김
- **Hover tooltip**: 해당 bucket의 Plan, Actual, Δ, Δ% 표기

### 8. 토글 필터 UI 위치

S-Curve Card의 헤더 영역에 Progress 탭과 동일 컴포넌트 배치:

```text
[▼ Plan vs Actual — S-Curve]         [Date range] [Bucket] [Export]
                                      ──────────────────────────────
[Group: All · Team · Sub Trade ...]  [Team: All Teams ▼]
[Stage: Start · Comp · Close]
```

`ToolbarGroup` / `ToggleGroup` / `Select` 컴포넌트 모두 Progress 탭과 동일하게 재사용.

## Technical details

### 변경 파일

1. **`src/lib/defect-dashboard-utils.ts`** — `buildDefectSCurve` 시그니처 확장
   - 인자에 `stage: DefectScheduleStage` 추가 (단일 stage 처리)
   - 인자에 `groupBy?: DefectScheduleGroupBy | null` 추가 (없으면 전체 합산)
   - 반환 타입 변경: 그룹별로 plan/actual 분해된 시리즈
   - 새 반환 형태:
     ```ts
     type DefectSCurvePoint = {
       bucket: string;
       bucketLabel: string;
       isFuture: boolean;
       totalPlan: number;
       totalActual: number | null;
       totalVariance: number | null;     // actual - plan (today까지만)
       byGroup?: Record<string, { plan: number; actual: number | null }>;
     };
     ```

2. **`src/pages/DefectDashboardPage.tsx`** — S-Curve Card 재작성
   - 기존 12-series 차트 제거 → 누적 라인 차트 + Variance bar 차트(분리된 ComposedChart 또는 2-row layout)
   - Progress 탭에서 사용하는 `ToolbarGroup`, `ToggleGroup` 임포트 후 헤더에 배치
   - 새 state: `scurveGroup`, `scurveStage` (Team/Bucket은 기존 `teamFilter` / `scurveBucket` 재사용 — Team은 dashboard 전체 필터로 승격)
   - URL sync: `group`, `stage_view` 추가 (Progress와 동일 키)
   - KPI strip 컴포넌트 (Plan/Actual/Δ/Δ%) 추가
   - Group 분해 시 상위 8개 그룹 산출 + Others 합산 헬퍼

3. **`src/lib/defect-dashboard-utils.ts`** — 헬퍼 추가
   - `topGroups(items, groupBy, n)` — 그룹별 plan 총량 기준 상위 N
   - `getGroupKeyFor(item, groupBy)` — Progress의 `getDefectGroupKey` 재사용

### Progress 탭 변동 사항

코드 수정 없음. URL 키만 호환 유지 (`team`, `bucket`은 이미 동일).
S-Curve가 `group`/`stage_view`에 단일 값을 쓰더라도 Progress 탭 파서는 multi-value로 받기 때문에 정상 동작.

### Color palette

- **Plan**: `hsl(var(--muted-foreground))` (점선)
- **Actual**: `hsl(var(--primary))` (실선)
- **Variance(-)**: `hsl(var(--destructive))`
- **Variance(+)**: emerald(녹색 토큰 추가 또는 chart-2)
- **Future Plan**: `hsl(var(--muted))`
- **Group 분해 시**: chart-1 ~ chart-8 토큰 순환

### Visual mockup (data flow 예시)

```text
Cumulative Completion (count)
  1,500 ┤            Plan ╱╱╱╱╱
  1,250 ┤        ╱╱╱╱
  1,000 ┤    ╱╱╱╱  Actual ────
    750 ┤ ╱╱╱─────
    500 ┤╱──
        └─────────────────────────────  ← Today
        15 Apr   30 Apr   15 May   31 May

Variance (Actual − Plan, 일자별 증분)
   +20 ┤                  ▇
     0 ┼──▇──▇──▇──▇──▇──────▇──
   −20 ┤        ▇   ▇  ▇        ▇  ▇    ← 지연 발생
   −40 ┤              ▇    ▇
        15 Apr   30 Apr   15 May
```

## Out of scope

- T&C 모듈의 S-Curve 변경 (요청은 Defect 한정)
- 새 DB 컬럼/마이그레이션 (기존 plan/actual 날짜 컬럼만 사용)
- 다른 dashboard 카드(Top 10 Overdue, Status Distribution 등)의 디자인 변경
- 기존 export 포맷 변경

## 구현 후 사용자 가치

- "어느 stage에서, 어느 team이, 언제부터, 얼마나 지연되었는가"를 차트 한 장에서 즉시 파악
- Progress 탭과 동일한 필터 mental model로 두 화면을 자연스럽게 오갈 수 있음
- Variance bar로 회복 추세 / 악화 추세도 시각적으로 분명히 구분