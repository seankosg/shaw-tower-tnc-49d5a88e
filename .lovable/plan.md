

## Sticky 좌측 컬럼 오버랩 버그 수정

### 원인
`ScheduleMatrix.tsx`의 본문 행에서 좌측 4개 컬럼을 `sticky left-0 z-10`로 처리하고 있는데, 가로 스크롤 시 우측 날짜 셀들이 sticky 영역 **아래(z-index 낮음)**가 아니라 **위로 비쳐 보이는** 현상 발생.

근본 원인 2가지:
1. **배경 불투명도 부족** — sticky 좌측 div는 `bg-card`지만, 부모 `<div className="flex border-b ...">`에 `hover:bg-accent/30`이 적용. hover 시 sticky 셀 뒤로 비치지는 않지만, **sub-row의 sticky div는 `bg-muted/20` (반투명)** 이라 우측 셀이 그대로 비침.
2. **z-index 경쟁** — 가상화로 렌더되는 우측 셀들(`ScheduleCell`)에 명시적 z-index가 없지만, sticky 좌측이 `z-10`이고 ScheduleCell 내부에 `relative` 또는 변환(transform)이 있으면 stacking context가 꼬여 우측이 위로 올라올 수 있음.

### 해결

**1. Sub-row sticky 좌측 배경 불투명화**
- `bg-muted/20` → `bg-card` (또는 `bg-muted` 불투명)로 변경. 행 자체 배경은 `bg-muted/20` 유지하되 sticky 영역만 불투명.

**2. Sticky 좌측 z-index 상향**
- 본문 sticky 좌측: `z-10` → `z-20`
- 가상화 컬럼 wrapper에도 `relative z-0` 명시해 stacking 충돌 방지

**3. ScheduleCell `position: relative` 확인**
- `ScheduleCell.tsx`에 명시적 z-index 없는지 확인, 필요 시 `z-0` 명시

### 변경 파일
- `src/components/schedule/ScheduleMatrix.tsx` — sticky 좌측 배경/ z-index 수정 (그룹 행 + sub-row 둘 다)
- (필요 시) `src/components/schedule/ScheduleCell.tsx` — z-index 명시

### 검증
1. 가로 스크롤 시 우측 셀이 좌측 sticky 영역에 비쳐 보이지 않음
2. 시스템 행 펼침(Pred/T1/T2 sub-row) 후에도 동일하게 깔끔
3. Hover 효과 정상 (sticky 영역 hover 비침 없음)
4. 헤더-본문 sticky 레이어 순서 유지 (corner > header > body sticky > cells)

