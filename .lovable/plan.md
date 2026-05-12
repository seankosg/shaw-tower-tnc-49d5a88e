## Problem

현재 Simulation 차트는 stage(T1/T2/R1S/R2A) × type(Plan/Actual/Predicted) = 최대 **12개 레전드**를 그려서 시각적으로 과부하이고, 같은 색의 dash variant가 구분이 어렵습니다. Defect Simulation도 동일 문제(3 stage × 3 = 9개).

## Goal

같은 데이터를 유지하되, 레전드를 단순화하고 차트의 의미가 한눈에 보이도록 디자인을 개선합니다. (T&C / Defect 두 페이지에 동일 패턴 적용)

## 변경 내용

### 1. Legend 분리 (Recharts 기본 Legend 제거)

기본 `<Legend>`는 모든 Line을 한 줄에 나열해 12개가 됩니다. 이를 제거하고 차트 상단에 **2개의 커스텀 범례 바**로 분리:

- **Stages (색상)**: T1 ●  T2 ●  R1S ●  R2A ●  ← 색 구분만
- **Series (선 스타일)**:  ─── Actual    ┄┄┄ Plan    ··· Predicted  ← 흑색/muted 톤

이렇게 하면 사용자가 "색 = 단계, 선 모양 = 종류"라는 두 축으로 즉시 읽을 수 있고, 레전드 항목은 12 → **4 + 3 = 7개** (시각적으로는 두 줄).

### 2. Plan 라인을 백그라운드화

Plan은 baseline 참고선이므로 시각적 노이즈를 줄이도록:
- `strokeWidth: 1` (기존 1.5)
- `opacity: 0.4`
- 색은 stage 색 유지하되 옅게

Actual은 굵게(2.5), Predicted는 dotted(현재 유지). → 사용자의 시선이 "진짜 진척(Actual) + 예측(Predicted)"에 집중됨.

### 3. Stage 토글

상단 Stage 범례를 **클릭 가능한 칩**으로 만들어 단계별 show/hide 토글. 4개 모두 보면 복잡할 때 선택적으로 숨길 수 있습니다. (state는 in-memory)

### 4. Tooltip 정리

현재 tooltip은 활성 라인을 모두 나열해 항목이 12개까지 늘어남. 다음으로 변경:
- Stage별로 그룹핑 (T1: Plan 45% / Actual 40% / Predicted 42%)
- 값이 null인 항목은 숨김
- 날짜 헤더 진하게

### 5. Reference lines 라벨 위치 정리

`Data Date`와 `Target` 라벨이 `insideTopRight`로 같은 코너에 겹칠 수 있음. `Data Date`는 `insideTop`, `Target`은 `insideTopRight`로 분리.

### 6. Y축 / 그리드

- Y축에 0 / 25 / 50 / 75 / 100 ticks 명시 (`ticks={[0,25,50,75,100]}`)
- 가로 그리드만 표시(`vertical={false}`) — 가독성 ↑

## 적용 파일

- `src/pages/TncSimulationPage.tsx` (차트 블록만)
- `src/pages/DefectSimulationPage.tsx` (동일 패턴, 3 stage)

새 컴포넌트로 추출:
- `src/components/simulation/SimulationLineChart.tsx` — 두 페이지가 stage list + colors + series 데이터를 props로 넘겨 재사용

## 영향 없음

- 시뮬레이션 계산 로직, 데이터 구조, Recalculate, 권한, URL params, 기타 KPI 카드/테이블은 변경 없음
- 색상 토큰은 기존 `--chart-1..4` 그대로 사용

## Out of scope

- 차트 라이브러리 교체
- 다운로드/Export 기능
- 차트 외 페이지 레이아웃 변경
