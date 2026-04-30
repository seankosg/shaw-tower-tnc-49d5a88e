## 목표

Defect Dashboard S-Curve(group mode) 라인 차트의 **인코딩 방향을 사용자 원래 지시대로 정정**하고, Plan 라인의 가독성 값을 합의값으로 맞춘다.

## 현재 상태 (점검 결과)

`src/pages/DefectDashboardPage.tsx` 1306~1335 group mode 블록:

| 항목 | 현재 | 목표 |
|---|---|---|
| 색 인코딩 | Group별 색 (`GROUP_LINE_COLORS[idx]`) | **Stage별 색** (`STAGE_COLORS[s].line`) |
| Dash 인코딩 | Stage별 dash (`stageDash[s]`) | **Group별 dash** (`GROUP_DASH[idx]`) |
| Plan opacity | `0.55` | **`0.85`** |
| Plan width | `1.25` | **`1.75`** |

## 변경 사항

### 1. 새 상수 추가

```ts
// Group별 dash 패턴 (라인 패턴으로 group 구분)
const GROUP_DASH = [
  undefined,  // 1st group: solid
  '6 3',      // 2nd: long dash
  '2 3',      // 3rd: dotted
  '8 3 2 3',  // 4th: dash-dot
  '4 2 2 2',  // 5th
  '10 4',     // 6th
];
```

### 2. group mode `<Line>` 두 개 (Plan, Actual) 수정

- `stroke={color}` → `stroke={STAGE_COLORS[s].line}`
- Plan: `strokeDasharray={dash ? \`${dash}\` : '4 3'}` → `strokeDasharray={GROUP_DASH[idx % GROUP_DASH.length]}`
- Actual: `strokeDasharray={dash}` → `strokeDasharray={GROUP_DASH[idx % GROUP_DASH.length]}`
- Plan: `strokeOpacity={0.55}` → `strokeOpacity={0.85}`
- Plan: `strokeWidth={1.25}` → `strokeWidth={1.75}`
- Actual: `strokeWidth={2}` 유지

### 3. Tooltip/legend `cfg` 색상 정합성

`cfg`에서 `gp_${s}_${gk}`, `ga_${s}_${gk}` 항목의 `color`를 `STAGE_COLORS[s].line`로 변경 (현재는 GROUP_LINE_COLORS 기반).

### 4. 기존 unused 변수 정리

- group mode 블록 내 `color` 지역변수 제거
- `stageDash` 상수가 다른 곳에서 안 쓰이면 제거 (다른 사용처가 있으면 유지)

## 영향 없는 부분

- non-group mode 차트 (라인 1290~1305) — 변경 없음
- 데이터 계산 로직, group 정의

## 리스크

- Group이 많을 때(>6) dash 패턴 순환 — 색은 모두 같으므로(stage별) 구분이 어려워질 수 있음. 일반적으로 group 수는 4~5개 이하로 제한적이라 OK.
