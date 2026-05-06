# Defect Status — 동기화 + In Dispute 카드 신설

## 변경 개요

**수정사항 1**: `actual_closure_date`가 있는데 `closure_status≠Done`인 9건을 일괄 정렬 + DB 트리거로 향후 동기화 자동화. Dashboard는 기존 엄격 모드(`closure_status==='Done'`만 카운트) 유지.

**수정사항 2**: Aconex Status에 `In Dispute` 값이 들어오면 `closure_status='InD'`로 매핑. Tier 2 KPI 카드에 신규 `In Dispute` 카드 추가, Raw Data 배지에 색상 추가, Tier 3 알람 배너 추가.

---

## 사용자 승인 사항

- [x] 9건 일괄 UPDATE 진행
- [x] `Done` vs `InD` 충돌 시 → **Done 우선**
- [x] 알람 = Tier 3 보라 AlertBanner

---

## DB 상태 (확인 완료)

| 케이스 | 행수 |
|---|---|
| `actual_closure_date` 있고 `closure_status≠Done` | **9건** (WIP 5, NULL 2, Planned 2) |
| `status ILIKE 'in dispute'` | **32건** |

---

## 작업 항목

### Step A — DB 마이그레이션 (트리거)
`defect_items` BEFORE INSERT/UPDATE 트리거 추가:
```sql
CREATE OR REPLACE FUNCTION sync_defect_closure_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.actual_closure_date IS NOT NULL THEN
    NEW.closure_status := 'Done';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_defect_closure_status
BEFORE INSERT OR UPDATE ON defect_items
FOR EACH ROW EXECUTE FUNCTION sync_defect_closure_status();
```

### Step B — DB 데이터 일괄 정렬 (insert 도구)
```sql
-- 1) closure_status 동기화 (9건)
UPDATE defect_items
   SET closure_status = 'Done', updated_at = now()
 WHERE actual_closure_date IS NOT NULL
   AND (closure_status IS NULL OR closure_status <> 'Done');

-- 2) In Dispute 백필 (32건)
UPDATE defect_items
   SET closure_status = 'InD', updated_at = now()
 WHERE LOWER(TRIM(status)) = 'in dispute'
   AND actual_closure_date IS NULL
   AND (closure_status IS NULL OR closure_status <> 'InD');
```

### Step C — 코드 변경

1. **`src/lib/defect-utils.ts`**
   - `DefectStatusValue` → `'Planned' | 'Delay' | 'Done' | 'WIP' | 'InD'`
   - `DEFECT_STATUS_VALUES` 배열에 `'InD'` 추가

2. **`src/lib/defect-status.ts`**
   - `isStatusInDispute(status)` 헬퍼 추가
   - `computeClosureStatus()` 분기 추가 (순서: closure date → Closed → **InD** → planned overdue → ...)
   - 우선순위: `actual_closure_date`가 있으면 `Done` 우선 (사용자 결정)

3. **`src/components/defects/DefectStatusBadge.tsx`**
   - `InD` 보라 톤 클래스 추가

4. **`src/pages/DefectDashboardPage.tsx`**
   - `kpis`에 `inDisputeCount` 추가
   - Tier 2 카드: Overdue-Completion ↔ Overdue-Closure 사이에 `In Dispute` 카드 삽입
   - Tier 3: `inDisputeCount > 0`일 때 보라 `AlertBanner` 추가

5. **`src/pages/DefectRawDataPage.tsx`**
   - `closure_status` 필터 옵션에 `InD` 자동 포함 (enum 기반이면 무수정)

### Step D — 테스트
- `src/test/defect-status.test.ts`에 `InD` 매핑 케이스 추가

---

## Out of scope
- Schedule/Critical Watchlist 등 status 직접 사용 6곳은 InD 값 그대로 표시 (별도 색상 처리 후속)
- Overdue/At-Risk에서 InD 행 제외하지 않음 (요청 시 후속)
