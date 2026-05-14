## Delayed 관련 워딩 통합 이동 + 문구 수정

### 요약
`ToAchieveBand` 안에 남아있는 두 줄의 delayed 관련 부가 설명을, 새로 옮긴 Delayed 박스 위치로 합쳐서 이동시키고, "if recovered" → "to recover"로 문구를 수정합니다.

### 현재 상태
- Delayed 박스 본문(`N delayed · kept at... / shifted to... / excluded... / shifted +Xd`)은 이미 `QtyVsPlanBanner` 아래로 이동 완료.
- 하지만 `ToAchieveBand` 내부에는 아직 다음 두 줄이 남아 있음:
  1. `incl. {N} delayed item(s) in daily target` — optimistic / shift-today / learned 모드
  2. `excl. {N} delayed · if recovered: ~{X}/day` — penalty 모드

### 변경 내용

1. **`src/components/simulation/ToAchieveBand.tsx`**
   - 위 두 줄(JSX 블록)과 관련 계산(`recoverPerDay`, `includesDelayed`)을 제거.
   - props에서 `delayMode`, `delayedCount` 제거(또는 유지하되 미사용). → 깔끔하게 제거하는 방향으로.

2. **`src/components/simulation/QtyVsPlanBanner.tsx`** 또는 새 helper
   - Delayed 박스에 모드별 부가 정보를 같이 표시하도록 확장하는 대신, 두 simulation 페이지의 inline Delayed 박스 JSX에 두 줄을 추가:
     - optimistic / shift-today / learned: `incl. in daily target` 보조 라인
     - penalty: `· to recover: ~{X}/day` 보조 라인 (값은 `predicted - doneActual + delayedCount` ÷ 남은 일수로 페이지에서 계산)
   - "if recovered" → **"to recover"**로 워딩 변경.

3. **`src/pages/TncSimulationPage.tsx`** / **`src/pages/DefectSimulationPage.tsx`**
   - inline Delayed 박스 블록을 확장:
     ```text
     [AlertTriangle] N delayed · {모드별 처리 설명}
                     {모드에 따라 보조 라인 1줄 추가}
                       - optimistic/shift-today/learned: "incl. in daily target"
                       - penalty: "to recover: ~X/day" (남은 일수 > 0 일 때만)
     ```
   - 남은 일수(`days`)와 `recoverPerDay` 계산은 페이지 내 helper 또는 inline으로 (target − dataDate, `Math.ceil((predicted − doneActual + delayedCount) / days)`).
   - `ToAchieveBand` 호출에서 `delayMode`, `delayedCount` props 제거.

### 기술 세부
- `days = max(0, round((target − dataDate) / 86400000))`
- penalty 보조 라인은 `days > 0 && delayedCount > 0`일 때만 노출.
- 색상 톤은 기존 rose 유지 (penalty 라인은 약간 진한 rose, 그 외는 muted).
- 두 페이지 동일하게 적용.

### 영향 범위
순수 UI 재배치 + 문구 변경. 계산 로직(시뮬레이션 결과)은 변경 없음.