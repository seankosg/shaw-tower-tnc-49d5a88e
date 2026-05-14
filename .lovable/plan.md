## 목표

T&C Simulation 페이지(`/tc/simulation`)의 stage 요약 카드 UI/로직 두 가지 개선.

---

## 1) 현재 갭(Plan vs Actual) 경고 강화

**현상**: 카드에 `Predicted %`는 크게 표시되지만, 현재시점에서 계획대비 실적이 얼마나 부족한지(= `planPct - actualPct`)는 작은 `Gap vs Plan` 행 하나로만 표시되어 약함. Penalty 모드에서 특히 이 신호가 중요한데 묻혀버림.

**변경**: `src/components/simulation/ToAchieveBand.tsx` 바로 위(또는 내부 상단)에 새 경고 블록 추가.
- 위치: predicted 큰 숫자 바로 밑, "To Achieve" 박스 위.
- 표시 내용:
  - 라벨: **"Behind Plan Now"** (현재 시점 기준 = dataDate)
  - 값: `−X.X% (n items)`  ← `planAtDataDate(stage)` 와 `doneActual` 비교
  - 색상: 부족할 때 강한 rose/destructive (배경 살짝 + 굵은 글씨), 동등하거나 앞서면 emerald 미니 배지
- 부족분이 0 이하인 경우(현재 실적이 현재 계획 이상): 작은 emerald "On track" 칩으로 축소 표시.

기존 grid 안의 `Gap vs Plan` 항목은 "타깃일 기준 갭"이므로 라벨을 명확히 `Gap @ Target`으로 바꿔 새 "Behind Plan Now"(현재일 기준)와 구분.

**계산 추가**: `simulateTncStageAt`이 현재 `planAtDataDate`를 반환하지 않으므로 `src/lib/tnc-simulation.ts`의 `StageSimResult`에 다음 필드를 추가:
- `planAtDataDatePct: number` — `planned ≤ dataDate` 인 아이템 비율
- `behindNowPct: number` — `planAtDataDatePct - actualPct` (음수면 0으로 클램프 안 함, 그대로)
- `behindNowCount: number` — 동일 기준의 정수 갯수

(`simulateByTeam`도 동일 결과 사용하므로 자동 반영.)

---

## 2) Optimistic 모드의 일일 목표(perDay) 산정 보정

**현상**: `ToAchieveBand`의 `perDay = ceil((predicted - doneActual) / days)`.
- `days = targetIso - dataDate` (즉 미래 남은 일수만).
- Optimistic 모드에서는 지연 항목이 `forecast`에 포함되므로 `predicted - doneActual`에 지연 항목 수가 들어가긴 하나, 모드별 가산 의미가 표면화되지 않음. 사용자는 "지연된 것까지 합쳐서 남은 일수에 분배한 일일 목표"임이 명확히 보이길 원함.

**변경**: `ToAchieveBand`에 옵션 props로 `delayMode`, `delayedCount` 전달. perDay 표기를 모드별로 의미 명확화.
- Optimistic / Shift-today / Learned: 현재처럼 `predicted - doneActual` 기준 (이미 지연 포함). 라벨 옆에 **`incl. N delayed`** 작은 보조 텍스트로 명시.
- Penalty: 지연이 빠진 값임을 보여주기 위해 perDay 옆에 **`excl. N delayed`** 회색 보조 + 별도 줄에 "If recovered: ~M/day" 보조값 (분자에 `delayedCount` 더해서 계산) 표시.

핵심은 **계산 자체는 모드 정의 그대로 유지하되, optimistic에서 perDay가 지연분을 포함하고 있음을 사용자에게 가시화**하는 것. 만약 사용자가 원하는 것이 "분모는 미래 일수가 아닌 plan 기간 전체"라면 별도 확인 필요(아래 결정 포인트 참조).

---

## 결정이 필요한 포인트

사용자 요청 (2)의 해석 두 가지:
- (A) **표시 명확화 위주** — perDay 값은 지금과 동일하지만 "지연 N건 포함" 보조 텍스트를 명시. (위 계획안)
- (B) **수식 변경** — Optimistic에서 perDay 분자를 `(planOnly - doneActual)` 로 변경(원 계획 catch-up 속도 의미).

기본은 (A)로 진행 예정. (B)를 원하시면 알려주세요.

---

## 변경 파일

- `src/lib/tnc-simulation.ts` — `StageSimResult`에 `planAtDataDatePct`, `behindNowPct`, `behindNowCount` 추가, 시뮬레이션 함수에서 산출.
- `src/components/simulation/ToAchieveBand.tsx` — `delayMode`, `delayedCount` props 추가, perDay 보조 텍스트 표기.
- `src/pages/TncSimulationPage.tsx` — 카드에 새 "Behind Plan Now" 블록 추가, `Gap vs Plan` → `Gap @ Target` 라벨 변경, `ToAchieveBand`에 새 props 전달.
- `src/test/tnc-simulation.test.ts` — `planAtDataDatePct/behindNowPct` 케이스 보강.

Defect Simulation 페이지는 동일 패턴이지만 사용자가 T&C Simulation만 보고 있으므로 이번 범위에서 제외(원하시면 후속 적용).
