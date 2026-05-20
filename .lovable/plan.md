# Warranty Stage Progress 카드 — OD 칩 / 카드 본체 분리 네비게이션

## 목표
Docs Executive Dashboard의 Warranty Deeds 모듈 Stage Progress 카드에서:
- **OD 칩 클릭** → 해당 stage의 **Overdue만** 필터링하여 Warranty Raw Data로 이동
- **카드 본체(라벨·Progress 등) 클릭** → 해당 stage의 **전체 항목**을 필터링하여 Warranty Raw Data로 이동

## 현재 동작
`StageCard` 컴포넌트 전체에 단일 `onClick`이 걸려 있어, OD 칩을 클릭해도 카드 전체 클릭 이벤트가 발생하여 둘 다 동일한 URL(`?stage=<key>&overdue=1`)로 이동함.

## 변경 내용

### 1. StageCard 컴포넌트 수정 (`DocsExecutiveDashboardPage.tsx`)
- 새 prop 추가: `onODClick?: () => void`
- OD 칩(`OD overdue/rem` span)에 클릭 핸들러 추가:
  - `onODClick`이 있으면: `e.stopPropagation(); onODClick();`
  - `onODClick`이 없으면: 기존 동작 유지(카드 onClick 전파)
- OD 칩에 시각적 클릭 가능 힌트 추가: `cursor-pointer`, hover 시 살짝 강조

### 2. Warranty Stage 렌더링 수정 (동일 파일)
Warranty(`module === 'warranty'`)에만 적용. Spare Part 등 다른 모듈은 기존 동작 유지.

```text
기존:
  onClick → { stage: s.stage_key, overdue: '1' }

변경 후:
  카드 본체 onClick → { stage: s.stage_key }               (stage 전체)
  OD 칩   onODClick → { stage: s.stage_key, overdue: '1' } (overdue만)
```

### 3. Raw Data 필터 확인
- Warranty Raw Data의 `computeDashboardFilteredIds`는 `?stage=<key>`와 `?overdue=1`을 개별적으로 처리함.
- `stage`만 있으면: 해당 stage 미완료 항목 필터
- `stage` + `overdue=1`이면: 해당 stage 중 overdue 항목만 필터
- 기존 로직과 완전 호환됨. Raw Data 페이지 변경 불필요.

## 영향 범위
- 파일: `src/pages/docs/DocsExecutiveDashboardPage.tsx`만 수정
- 모듈: Warranty Deeds에만 적용 (ABD/OMM/Spare Part 동작 불변)
- 데이터: 백엔드/스키마/RLS 변경 없음
