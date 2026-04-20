

## Schedule Matrix 컬럼 재배치 (수정)

### 변경사항

#### 1. 우측 고정 컬럼 (총 8개 sub-column)

**기존**: `Done/Total` + `Actual/Plan`

**변경 후**:
- **Total / Done / % / Remain** (4개)
  - `% = (Done / Total) × 100`, Total=0이면 `—`
  - `Remain = Total - Done`
- **Plan / Actual / % / Diff** (4개)
  - `% = (Actual / Plan) × 100`, Plan=0이면 `—`
  - `Diff = Actual - Plan` (음수=short/빨강, 양수=over/파랑)

#### 2. ScheduleCell (시간축 셀) 순서 변경
- 기존: `{actual} /{plan}`
- 변경: `{plan} /{actual}` 순서
- Diff 표시(`+N`/`-N`) 위치 유지

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/components/schedule/ScheduleMatrix.tsx` | 헤더 + 그룹/Stage 행을 8개 sub-column으로 재구성, `ActualPlanCell` 분리 + `TotalDoneCell` 신규 |
| `src/components/schedule/ScheduleCell.tsx` | 셀 텍스트 순서 plan→actual로 |
| `src/pages/SchedulePage.tsx` | KPI strip 표시 순서/포맷 통일 (Plan/Actual/%/Diff, Total/Done/%/Remain) |

### 레이아웃 헤더 예시

```text
| Group(200) | Total Done  %  Remain | Plan Actual  %  Diff | ...buckets...
|            |   18   12  67%    6   |   0    12   —   +12  |
```

좌측 sticky 폭: 200 + (4×45) + (4×45) ≈ 560px (기존 380px → 560px)

### 검증
1. Stage='All' DXFCU L1 FCC: Total=18, Done=12, %=67%, Remain=6 / Plan=0, Actual=12, %=—, Diff=+12
2. ScheduleCell에 plan→actual 순서 표시 확인
3. % 컬럼 색상: Done% < 100 정상, Actual/Plan% <100 short, >100 over

