## Delayed 표시 박스 위치 이동

### 요약
T&C Simulation 및 Defect Simulation 카드 내에서 "Delayed N items" 표시 박스를 현재 위치(2열 stats 아래)에서 `QtyVsPlanBanner` 아래, `ToAchieveBand` 위로 이동시킵니다.

### 변경 대상
- `src/pages/TncSimulationPage.tsx`
- `src/pages/DefectSimulationPage.tsx`

### 세부 내용
각 stage summary card의 JSX 요소 순서를 다음과 같이 재배치:

```text
현재 순서:
  1. Predicted %
  2. QtyVsPlanBanner
  3. ToAchieveBand
  4. 2열 stats (Done now / Plan / Gap @ Target / Forecast new)
  5. Delayed 박스
  6. No Plan 박스
  7. View remaining 버튼

변경 후 순서:
  1. Predicted %
  2. QtyVsPlanBanner
  3. Delayed 박스  ← 이동
  4. ToAchieveBand
  5. 2열 stats
  6. No Plan 박스
  7. View remaining 버튼
```

- 두 파일 모두 동일한 순서로 조정합니다.
- 로직/데이터 계산 변경 없음. 순수 UI 배치 변경입니다.