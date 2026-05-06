# Defect Status — 동기화 + In Dispute 카드 신설

## 사용자 결정 사항
- 9건 일괄 UPDATE 진행: **승인**
- `Done` vs `InD` 충돌 → **Done 우선**
- 알람 위치 → **Tier 3 보라색 AlertBanner**

---

## DB 현황 (확인 완료)
- `actual_closure_date` 있고 `closure_status≠Done`: **9건** (WIP 5, NULL 2, Planned 2)
- `status ILIKE 'in dispute'`: **32건**

---

## 실행 순서

### Step A — DB 트리거 마이그레이션
`defect_items`에 BEFORE INSERT/UPDATE 트리거 추가. `actual_closure_date IS NOT NULL`이면 `closure_status := 'Done'` 강제. 향후 어느 경로(import / inline edit / bulk edit)에서도 비동기화 방지.

### Step B — DB 일괄 UPDATE (insert 도구)
1. 기존 9건 → `closure_status='Done'` 동기화
2. 기존 32건 → `closure_status='InD'` 백필 (단, `actual_closure_date IS NULL`인 것만)

### Step C — 코드 변경
1. **`src/lib/defect-utils.ts`** — `DefectStatusValue`에 `'InD'` 추가, `DEFECT_STATUS_VALUES` 배열 확장
2. **`src/lib/defect-status.ts`** — `isStatusInDispute()` 헬퍼 + `computeClosureStatus()`에 InD 분기 추가 (Done > InD 우선순위)
3. **`src/components/defects/DefectStatusBadge.tsx`** — `InD` 보라 톤 클래스 추가
4. **`src/pages/DefectDashboardPage.tsx`** — `inDisputeCount` KPI 추가 + Tier 2 카드 (Overdue-Completion ↔ Overdue-Closure 사이 삽입) + Tier 3 보라 AlertBanner
5. **`src/pages/DefectRawDataPage.tsx`** — closure_status 필터 옵션에 `InD` 자동 포함 확인

### Step D — 테스트
`src/test/defect-status.test.ts`에 InD 매핑 케이스 추가

---

## Out of scope
- Schedule/Critical Watchlist 등 status 직접 사용 6곳은 InD 값 그대로 표시 (별도 색상은 후속)
- Overdue/At-Risk 계산에서 InD 행 제외하지 않음 (요청 시 후속)
