

## Actual Date 백필 + Import 자동 채움 (확정안)

### 사용자 결정 반영
- **문제1 (planned_date도 NULL)**: planned_date 있으면 그것 사용, 없으면 `updated_at::date` 사용 (둘 다 NULL이면 2026-04-19)
- **문제2 (Import 변화 시점)**: status='Done' & actual_date 비어있으면 무조건 채움 (신규 insert 포함)
- **문제3 (cutoff 포함)**: `planned_date <= '2026-04-19'` 포함
- **Import 자동 채움 날짜**: import 실행 시점 하루 전 (yesterday)

### A. 일회성 백필 (data UPDATE — insert 도구 사용)

T1, T2 각각 다음 우선순위로 actual_date 채움:
1. `t{n}_planned_date` (NOT NULL이고 ≤ 2026-04-19)
2. `updated_at::date`
3. `'2026-04-19'`

```sql
-- T1
UPDATE subtests
SET t1_actual_date = COALESCE(
  CASE WHEN t1_planned_date <= '2026-04-19' THEN t1_planned_date END,
  updated_at::date,
  '2026-04-19'::date
)
WHERE is_active = true
  AND t1_status = 'Done'
  AND t1_actual_date IS NULL
  AND (t1_planned_date IS NULL OR t1_planned_date <= '2026-04-19');

-- T2 동일 패턴
UPDATE subtests
SET t2_actual_date = COALESCE(
  CASE WHEN t2_planned_date <= '2026-04-19' THEN t2_planned_date END,
  updated_at::date,
  '2026-04-19'::date
)
WHERE is_active = true
  AND t2_status = 'Done'
  AND t2_actual_date IS NULL
  AND (t2_planned_date IS NULL OR t2_planned_date <= '2026-04-19');
```

백필 대상 행에 대해 `subtest_change_log`에 `change_source='excel_import'`로 일괄 기록 (기존 enum 값 사용; 'backfill' 값 없음).

### B. Import 자동 채움 (`src/contexts/ImportContext.tsx`)

`processFile()` 내 upsert 직전:
- `yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10)`
- 최종 t1_status='Done' && 최종 t1_actual_date 비어있음 → `t1_actual_date = yesterday`
- T2 동일
- Excel에 명시된 actual_date가 있으면 그대로 우선 (덮어쓰지 않음)
- 신규 insert/기존 update 양쪽 모두 적용

### C. 덮어쓰기 방지 가드 (`SubtestDetail.tsx`, `MobileUpdatePage.tsx`)
- status를 Done으로 바꿀 때 `actual_date`가 이미 있으면 유지, 없을 때만 today로 채움

### 변경 파일
| 파일 | 내용 |
|---|---|
| (insert tool 1회 실행) | T1/T2 백필 UPDATE + change_log 일괄 INSERT |
| `src/contexts/ImportContext.tsx` | Import 시 Done & actual_date 빈 경우 yesterday 자동 채움 |
| `src/pages/SubtestDetail.tsx` | actual_date 덮어쓰기 방지 가드 |
| `src/pages/MobileUpdatePage.tsx` | 동일 가드 |

### 검증
1. 백필 후 `SELECT COUNT(*) FROM subtests WHERE t1_status='Done' AND t1_actual_date IS NULL` = 0 (cutoff 이내)
2. 백필 후 `SELECT COUNT(*) FROM subtests WHERE t2_status='Done' AND t2_actual_date IS NULL` = 0
3. Schedule KPI Cum Actual ≈ Subtest Master Done 카운트
4. Excel에 t1_status='Done', actual_date 빈 행 import → DB에 yesterday로 저장
5. 이미 actual_date 있던 행은 import 후 변경 없음
6. SubtestDetail에서 Done→Planned→Done 토글 시 기존 actual_date 보존
7. change_log에 백필/import 자동 채움 이벤트 기록

### 비변경
DB 스키마 / RLS / Pred 처리 / Schedule 표시 로직 / SubtestList

