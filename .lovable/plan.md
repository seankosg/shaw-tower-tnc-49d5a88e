## 문제 진단

S-Curve 차트의 Group 모드에서 일일 막대(`Bar`)가 시각적으로 보이지 않는 근본 원인은 **데이터 누락이 아니라 색상 표기법 문제**입니다.

- 호버 툴팁에 plan/actual 숫자가 정상 표시됨 → `planInc_*`, `actualInc_*` 데이터는 잘 합산되고 있음
- 그런데도 막대가 화면에 안 그려짐 → Recharts `<Bar fill=...>`에 전달되는 색상값이 SVG에서 파싱 실패

### 코드상 색상 정의 (`STAGE_COLORS`, line 1122)
```ts
start:      { line: 'hsl(217 91% 60%)',   bar: 'hsl(217 91% 60% / 0.45)' },
completion: { line: 'hsl(38 92% 50%)',    bar: 'hsl(38 92% 50% / 0.45)' },
closure:    { line: 'hsl(160 60% 45%)',   bar: 'hsl(160 60% 45% / 0.45)' },
```

이 값들은 `<Bar fill={STAGE_COLORS[s].bar} />` 형태로 SVG `fill` 속성에 그대로 전달됩니다. SVG는 CSS Color Module Level 4의 **공백/슬래시 구분 `hsl()` 표기법을 지원하지 않습니다**. SVG가 인식하는 형태는 `hsl(217, 91%, 60%)`(콤마 구분) 또는 `hsla(217, 91%, 60%, 0.45)`입니다. 따라서 막대가 투명하거나 무색으로 그려져 보이지 않게 됩니다. 비-Group 모드의 막대(`hsl(var(--muted-foreground) / 0.25)`)는 CSS var를 한 번 거치면서 브라우저에 의해 일부 보정되거나, 회색 톤이라 부분적으로 렌더된 것처럼 보였을 수 있습니다.

## 수정 내용

`src/pages/DefectDashboardPage.tsx`의 `STAGE_COLORS` 상수를 SVG가 안전하게 인식하는 콤마 구분 표기로 변경합니다.

```ts
const STAGE_COLORS: Record<DefectScheduleStage, { line: string; bar: string }> = {
  start:      { line: 'hsl(217, 91%, 60%)',  bar: 'hsla(217, 91%, 60%, 0.45)' },
  completion: { line: 'hsl(38, 92%, 50%)',   bar: 'hsla(38, 92%, 50%, 0.45)'  },
  closure:    { line: 'hsl(160, 60%, 45%)',  bar: 'hsla(160, 60%, 45%, 0.45)' },
};
```

추가로 비-Group 모드 막대의 색상도 동일한 SVG-호환 표기로 변경합니다 (line 1054-1055):

```tsx
<Bar ... fill="hsla(0, 0%, 50%, 0.35)" name="Plan (daily)" ... />
<Bar ... fill="hsla(217, 91%, 60%, 0.45)" name="Actual (daily)" ... />
```

이렇게 하면:
- Group 선택 시 Stage별로 색상이 입혀진 일일 stacked 막대(Plan은 반투명, Actual은 더 진한 색)가 보조 Y축 기준으로 보이게 됩니다.
- 누적선과 일일 막대가 같은 색 계열로 시각적 연관성을 가집니다.

## 영향 범위

- 차트의 데이터/구조/축은 변경하지 않음 — 색상 문자열만 수정
- KPI 스트립 좌측 테두리(line 1148) 색상은 같은 `STAGE_COLORS[s].line`을 사용하지만 CSS `border-left-color`로 들어가므로 두 표기 모두 정상 동작 (변경 없음)

## 변경 파일

- `src/pages/DefectDashboardPage.tsx` (`STAGE_COLORS` 상수 + 비-Group 모드 두 `Bar`의 `fill`)
