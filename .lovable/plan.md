## 변경 대상
`src/components/analysis/ProductivityTable.tsx`

## 구현 내용

### 1. Total 행 추가 (헤더 바로 아래)
- 협력사 행들 위에 **메트릭별 Total 행**을 추가 (현재 표시 중인 메트릭이 T&C Planned / T&C Actual / Defect Planned / Defect Actual이면 그만큼 Total 행 생성).
- `Subcontractor` 컬럼 셀에는 **"Total"** 표시(metric rows 개수만큼 `rowSpan`으로 병합).
- 각 셀 계산식:
  - `Qty` = 표시 중인 모든 협력사(`rowSubs`)의 해당 metric × 해당 날짜 Qty 합
  - `Man` = 모든 협력사의 해당 날짜 × 해당 workplace(T&C/Defect) Man 합
  - `Nos/Man` = 합산된 `Qty / Man` (`prod()` 재사용)
  - Average(Qty/Man/Nos/Man) 컬럼도 동일하게 합산 후 평균
- 스타일: 굵게(`font-bold`), 배경 `bg-muted`, 상하 보더 강조로 일반 데이터 행과 시각적 구분.

### 2. 세로 스크롤 컨테이너
- 현재 `<div className="max-w-full overflow-x-auto">`를 `overflow-auto`로 바꾸고 `max-h-[70vh]`(혹은 600px) 부여하여 세로 스크롤 활성화.
- 가로 sticky 컬럼들(Subcontractor / Metric / Average 그룹)은 기존 그대로 유지.

### 3. Sticky 처리
- **헤더 두 줄(`TableHeader` > `TableRow` 2개)**: `sticky top-0 z-30` 적용. 이미 좌측 sticky가 있는 셀들은 `top-0` 추가 + z-index 상향.
  - 두 번째 헤더 행은 `top: H1`(첫 헤더 행 높이) 위치에 sticky. 헤더 높이가 가변이라 `top-[28px]` 같은 고정값 대신 두 행 모두 `top-0`이고 표시 순서로 자연스럽게 쌓이도록 `position: sticky`만 부여하면 됩니다. 실제로는 첫 행 `top:0`, 두 번째 행 `top: 32px`처럼 명시 필요 → 헤더 행 높이를 `h-8`(32px)로 고정해 안정화.
- **Total 행들**: `sticky` + `top: 64px`(헤더 2행 합계) + `z-25`. Metric별 Total 행이 여러 개면 각 행마다 누적 top 오프셋 부여 (`top = 64 + 32 * idx`).
- 좌측 sticky 셀(`Subcontractor`, `Metric`, `Average` 3개 셀)은 세로 sticky와 결합되도록 z-index를 `z-40` 등으로 더 높게 설정해 스크롤 시 정상 노출.

### 4. 기타
- `rowSubs.length === 0` 등 빈 상태 처리는 기존 유지.
- 기존 협력사 데이터 행, Average 컬럼 로직은 변경 없음.

## 검증
- DMR Dashboard에서 다음 확인:
  - 헤더 아래에 "Total" 행이 메트릭 수만큼 보이고 값이 모든 협력사 합과 일치
  - 세로 스크롤 시 헤더 + Total 행이 상단 고정
  - 가로 스크롤 시 좌측 Subcontractor/Metric/Average 컬럼이 정상 고정
  - 모바일/좁은 뷰포트에서도 sticky가 깨지지 않음
