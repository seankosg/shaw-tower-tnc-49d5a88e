## Critical Level Summary — 메타 칩화 + 정렬 일관성

현재 한 줄 메타 영역(items / Main Cat / Pre-Eng / Earliest / Latest)을 각각 **개별 칩(badge)** 형태로 변환하고, 모든 카드에서 칩 위치가 동일한 그리드 컬럼에 정렬되도록 한다.

### 변경 사항 (`src/pages/PunchDashboardPage.tsx` — `CriticalLevelRowCard`만 수정)

1. **레이아웃 재구성**
   - 카드 내부를 `grid grid-cols-[auto_1fr_auto]` 형태로 정렬:
     - 좌측: Critical Level 레이블 (고정 폭 `w-28`, `text-2xl font-bold`)
     - 중앙: 메타 칩 영역 (5개 칩, 고정 순서)
     - 우측: Progress bar + %
   - 카드마다 동일한 컬럼 폭 → 시각적으로 모든 칩이 수직 정렬됨

2. **메타 → 칩(Chip) 5종 (고정 순서, 고정 너비)**
   각 칩은 `inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs`로 통일된 스타일. 칩 내부 구성: `아이콘 + 레이블(uppercase, muted) + 값(font-medium, tabular-nums)`.
   
   | # | 아이콘 | 레이블 | 값 | 최소 폭 |
   |---|---|---|---|---|
   | 1 | `ListChecks` | Items | `{total}` | `min-w-[6.5rem]` |
   | 2 | `Layers` | Main Cat | `{topCats join + N}` | `min-w-[10rem]` (flex-1 허용) |
   | 3 | `Wrench` | Pre-Eng | `{ready}/{total}` | `min-w-[7rem]` |
   | 4 | `CalendarArrowUp` | Earliest | `{date or —}` | `min-w-[8.5rem]` |
   | 5 | `CalendarArrowDown` | Latest | `{date or —}` | `min-w-[8.5rem]` |

   - 칩 컨테이너: `flex flex-wrap items-center gap-2`
   - 모든 카드에서 같은 순서·최소 폭이라 동일 위치에 정렬됨

3. **Progress 영역**
   - 두 번째 줄 유지 (`mt-3`)
   - 좌측 라벨 `Overall Progress` 너비 통일 (`w-32 shrink-0`)
   - 우측 `%` 텍스트 `w-12 text-right` 유지

4. **상호작용**
   - 카드 전체 클릭으로 RawData 드릴다운 (`criticalLevel=...`) — 기존 동작 유지
   - 칩은 시각 요소로만 사용 (클릭 이벤트 없음)

### 변경하지 않는 것

- `punch-dashboard-utils.ts` 데이터 모델/계산 로직
- 다른 카드/대시보드 영역
- 상위 그리드 (`sm:grid-cols-2 xl:grid-cols-3`)
- 백엔드/DB/라우팅

### 결과 미리보기 (ASCII)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ High    │ [☑ Items 240] [▤ Main Cat E,M,I +2] [⚙ Pre-Eng 180/240] ...      │
│         │ Overall Progress ▓▓▓▓▓▓▓▓░░░░░░░  62%                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ mid-High│ [☑ Items 120] [▤ Main Cat E,P]      [⚙ Pre-Eng  90/120] ...      │
│         │ Overall Progress ▓▓▓▓▓▓▓▓▓▓▓░░░░  75%                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
각 칩이 동일한 컬럼 위치에서 시작되어 카드 간 비교가 쉬워진다.
