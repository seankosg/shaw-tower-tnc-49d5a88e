## 목적
T&C / Defect 시뮬레이션 카드의 "Behind Plan Now" / "On track vs plan" 배너 워딩을 개수(quantity) 기반 표현으로 통일.

## 변경 워딩
현재 `behindNowCount` (= `doneActual − planAtDataDate`) 값 부호에 따라:

- `behindNowCount < 0` → **Behind in Q'ty by** (rose 강조 박스 유지)
- `behindNowCount === 0` → **On Track in Q'ty by** (emerald 박스)
- `behindNowCount > 0` → **Ahead in Q'ty by** (emerald 박스)

표시 형식 (% 와 items count 둘 다 유지):
```
BEHIND IN Q'TY BY
71 items  ·  -7.1%   short of plan @ 2026-05-13
```
- 큰 숫자: `Math.abs(behindNowCount)` items
- 작은 보조: `behindNowPct.toFixed(1)%` (Ahead일 때 `+`, Behind일 때 `-`)
- 끝 문구: `vs plan @ {dataDate}` (Behind는 "short of plan", Ahead는 "ahead of plan")

## 적용 파일 (UI 전용, 로직 변경 없음)
1. `src/pages/TncSimulationPage.tsx` — 스테이지 카드 배너 (line ~301-321 영역)
2. `src/pages/DefectSimulationPage.tsx` — 동일 구조의 배너

## 기술 노트
- `behindNowCount`, `behindNowPct` 계산 로직(`tnc-simulation.ts`, `defect-simulation.ts`)은 **변경하지 않음** — 라벨만 교체.
- 하단 "N delayed" 칩과는 별개 지표임을 워딩으로 더 분명히 함 ("Q'ty" = 누적 개수 갭, "delayed" = 미완료·기한초과 항목 수).
- 3-state(Ahead/On Track/Behind) 분기로 단순화하여 기존 emerald inline 배지를 박스 형태로 통일.
