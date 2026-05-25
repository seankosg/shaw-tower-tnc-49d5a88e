## 목표
1. **Summary 자동 집계** (Planned + Actual 모두):
   - `planned_start_date` = MIN(자식 planned_start_date)
   - `planned_completion_date` = MAX(자식 planned_completion_date)
   - `actual_start_date` = MIN(자식 actual_start_date) — 자식 중 하나도 시작했으면 가장 빠른 시작일
   - `actual_completion_date` = MAX(자식 actual_completion_date), 단 **모든 자식이 actual_completion_date 를 가질 때만** 채움. 아니면 NULL. (한 자식이라도 미완료면 Summary 도 미완료)
2. **정렬**: Summary/단독 행은 `item_no` 순, Summary 의 자식 Subtask 는 Summary 그룹 안에서 `planned_start_date` 오름차순(NULL 마지막), 동률은 `item_no`.
3. **UI**: Summary 의 4개 날짜 필드는 읽기 전용 + "Auto" 배지.

## 변경 사항

### A. DB 마이그레이션 — Summary 4개 날짜 자동 집계 트리거

함수 `punch_recompute_summary_dates(p_parent uuid)`:
```sql
UPDATE punch_items p
SET planned_start_date      = sub.min_ps,
    planned_completion_date = sub.max_pc,
    actual_start_date       = sub.min_as,
    actual_completion_date  = CASE WHEN sub.cnt > 0 AND sub.cnt_ac = sub.cnt
                                   THEN sub.max_ac ELSE NULL END,
    updated_at              = now()
FROM (
  SELECT
    COUNT(*)                          AS cnt,
    COUNT(actual_completion_date)     AS cnt_ac,
    MIN(planned_start_date)           AS min_ps,
    MAX(planned_completion_date)      AS max_pc,
    MIN(actual_start_date)            AS min_as,
    MAX(actual_completion_date)       AS max_ac
  FROM punch_items
  WHERE parent_id = p_parent
) sub
WHERE p.id = p_parent AND p.is_summary = true;
```

트리거 `trg_punch_summary_dates` (AFTER INSERT/UPDATE/DELETE on `punch_items` FOR EACH ROW):
- INSERT: `NEW.parent_id` 가 있으면 재계산.
- UPDATE: `OLD.parent_id` 와 `NEW.parent_id` 각각(다르면 둘 다) 재계산. 단 변경된 컬럼이 4개 날짜/parent_id/is_summary 일 때만(가벼운 가드).
- DELETE: `OLD.parent_id`.
- 재귀 방지: Summary 는 `parent_id IS NULL` 이므로 Summary 자체 UPDATE 시 트리거가 다시 호출되어도 `NEW.parent_id IS NULL → no-op`.

1회 백필:
```sql
WITH agg AS (
  SELECT parent_id,
         COUNT(*) cnt, COUNT(actual_completion_date) cnt_ac,
         MIN(planned_start_date) min_ps, MAX(planned_completion_date) max_pc,
         MIN(actual_start_date) min_as,  MAX(actual_completion_date) max_ac
  FROM punch_items WHERE parent_id IS NOT NULL GROUP BY parent_id
)
UPDATE punch_items p SET
  planned_start_date = a.min_ps,
  planned_completion_date = a.max_pc,
  actual_start_date  = a.min_as,
  actual_completion_date = CASE WHEN a.cnt_ac = a.cnt THEN a.max_ac ELSE NULL END
FROM agg a WHERE p.id = a.parent_id AND p.is_summary = true;
```

### B. `src/pages/PunchDetailPage.tsx`
- L208 자식 fetch: `.order('planned_start_date', { ascending: true, nullsFirst: false }).order('item_no')`.
- Summary 행의 4개 날짜 입력란(`planned_start_date`, `planned_completion_date`, `actual_start_date`, `actual_completion_date`):
  - `is_summary && children.length > 0` 일 때 `disabled` + "Auto from subtasks" 배지.
  - tooltip: "Computed from child subtasks. Edit subtask dates instead."

### C. `src/pages/PunchRawDataPage.tsx` — 계층적 정렬
- `DEFAULT_SORTING = [{ id: 'item_no', desc: false }]` 유지.
- 데이터 메모 단계에서 `sorting` 이 default(=item_no asc 단독)일 때만 다음 재배치 적용:
  1. `parent_id IS NULL` 행을 `compareItemNo` 로 정렬.
  2. 각 부모 뒤에 자식들을 `planned_start_date asc nulls last, item_no asc` 로 정렬해 삽입.
  3. 고아 자식은 맨 뒤.
- 사용자가 다른 컬럼으로 정렬하면 React Table 기본 정렬에 위임(계층 무시).
- 구현: `data` useMemo 에서 위 알고리즘 적용해 정렬된 배열 반환. Inline 처리이므로 React Table 의 `getSortedRowModel` 에는 영향 없음(기본 정렬 키가 item_no 라 동순서 → 우리 미리 정렬이 그대로 표시됨). 안전을 위해 `enableSorting` 은 유지.

### D. Field 편집 가능성(권한·잠금) 통합
- 기존 `usePunchFieldConfig` / 인라인 편집 컴포넌트에서 위 4개 필드는 행 단위로 "summary-aggregated" 라면 disabled 처리. 헬퍼 `isSummaryAggregatedField(row, field)` 추가.
- Raw Data 인라인 셀 편집 & 상세 페이지 모두에서 동일 헬퍼 사용.

### E. 영향 없음
- `add_punch_subtask` RPC, `item_no` 부여 — 변경 없음.
- Item No 재번호 매김 없음.
- Import: 트리거가 부모 날짜를 자동으로 덮어쓰므로 import 시 입력된 Summary 행의 날짜는 무시되는 결과(자식이 있으면). 이는 의도된 동작.

## 동작 예시
부모 `3` Summary, 자식 4개 — 모두 actual_completion_date 있음:

| Item No | PS | PC | AS | AC |
|---|---|---|---|---|
| 3.1 | 06-15 | 06-20 | 06-16 | 06-22 |
| 3.2 | 07-01 | 07-10 | 07-02 | 07-12 |
| 3.3 | 07-20 | 07-25 | NULL | NULL |
| 3.4 | 06-10 | 06-12 | 06-11 | 06-13 |

→ Summary `3`: PS=06-10, PC=07-25, AS=06-11, AC=**NULL** (3.3 미완료).

표시 순서(item_no `3` 그룹):
```
3      Summary    06-10  07-25  06-11  —
3.4    Subtask    06-10  06-12  06-11  06-13
3.1    Subtask    06-15  06-20  06-16  06-22
3.2    Subtask    07-01  07-10  07-02  07-12
3.3    Subtask    07-20  07-25  —      —
```
