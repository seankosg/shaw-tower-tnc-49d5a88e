

# S-Curve 콤보 차트 + 날짜 범위 선택기 + T1/T2 막대 색상

## 요약

S-Curve `LineChart`를 **콤보 차트**(ComposedChart)로 변경합니다:
- **막대그래프**: T1 Plan/Actual + T2 Plan/Actual (비누적, 묶음 막대)
- **라인 (S-Curve)**: T1/T2 Plan/Actual 누적
- **기본 기간**: 2026-04-15 ~ 2026-06-07 (DatePicker로 변경 가능)
- **X축**: `dd-MMM` 형식
- **Actual**: 조회일 이후 `null` 처리
- **토글**: Daily / Weekly

## 막대 색상

| 막대 | 색상 |
|------|------|
| T1 Plan | 연한 파랑 `hsl(220, 70%, 75%)` |
| T1 Actual | 진한 파랑 `hsl(220, 70%, 40%)` |
| T2 Plan | 연한 주황 `hsl(30, 90%, 75%)` |
| T2 Actual | 진한 주황 `hsl(30, 90%, 45%)` |

## 변경 내용

### 1. `src/lib/dashboard-utils.ts` — `buildSCurve` 리팩터

- 시그니처: `buildSCurve(subs, granularity, startDate, endDate, today)`
- `rangeDays` 제거 → `startDate`/`endDate` (ISO string)
- `SCurvePoint` 확장:

```typescript
export interface SCurvePoint {
  bucket: string;
  bucketLabel: string;        // dd-MMM
  t1Planned: number;
  t1Actual: number | null;    // null after today
  t2Planned: number;
  t2Actual: number | null;    // null after today
  t1BarPlan: number;          // non-cumulative
  t1BarActual: number | null;
  t2BarPlan: number;          // non-cumulative
  t2BarActual: number | null;
}
```

- `startDate`~`endDate` 범위의 모든 버킷 생성 (빈 날도 0)
- `startDate` 이전 데이터는 누적 carry-over에만 반영
- `bucket > today`이면 Actual 값 `null`

### 2. `src/pages/DashboardPage.tsx` — 차트 UI 변경

**새 state**:
```typescript
const [scurveStart, setScurveStart] = useState('2026-04-15');
const [scurveEnd, setScurveEnd] = useState('2026-06-07');
```

**Import 추가**: `Bar`, `ComposedChart` (Recharts), `Popover`/`PopoverTrigger`/`PopoverContent`, `Calendar` (Shadcn), `CalendarIcon` (lucide), `format` (date-fns)

**툴바**: 시작일/종료일 DatePicker 2개 + Daily/Weekly 토글

**차트**: `LineChart` → `ComposedChart`
- `<Bar>` 4개: T1 Plan, T1 Actual, T2 Plan, T2 Actual (묶음 막대)
- `<Line>` 4개: T1/T2 Plan/Actual 누적 S-Curve
- `connectNulls={false}` — Actual 라인 today 이후 끊김
- X축 `dataKey="bucketLabel"`

**chartConfig 추가**:
```typescript
t1BarPlan:   { label: 'T1 Plan',   color: 'hsl(220, 70%, 75%)' },
t1BarActual: { label: 'T1 Actual', color: 'hsl(220, 70%, 40%)' },
t2BarPlan:   { label: 'T2 Plan',   color: 'hsl(30, 90%, 75%)' },
t2BarActual: { label: 'T2 Actual', color: 'hsl(30, 90%, 45%)' },
```

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/lib/dashboard-utils.ts` | `SCurvePoint` 확장, `buildSCurve` 시그니처/로직 변경 |
| `src/pages/DashboardPage.tsx` | 날짜 state, DatePicker UI, ComposedChart + Bar 4개, chartConfig, X축 포맷 |

