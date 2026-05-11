## OMM Stage Progress — 2nd Status 카드 추가 + Planned → TBS 변경

### 변경 결과 (5개 카드)

| # | 카드 | 표시 |
|---|------|------|
| 1 | 1st Status | A / B / C / UR / **TBS** |
| 2 | 2nd Submission | total / done / overdue |
| 3 | **2nd Status** (신규) | A / B / C / UR / **TBS** |
| 4 | Final Submission | total / done / overdue |
| 5 | Final Approval | total / done / overdue |

기존 2nd Response StageCard는 제거되고 2nd Status 카드로 대체.

### 버킷 정의 (1st / 2nd 동일 패턴)

OMM 행 단위, 합 = 전체 OMM 행수:

**1st Status**
- A/B/C — `sub1_response_status`
- UR — `sub1_actual_date` 있음 & response_status 없음
- **TBS** (To Be Submitted) — `sub1_actual_date` 없음

**2nd Status**
- A/B/C — `sub2_response_status`
- UR — `sub2_actual_date` 있음 & response_status 없음
- **TBS** — `sub2_actual_date` 없음

### 변경 파일

**1. `src/lib/docs-stage-records.ts`**
- `OmmSub1StatusBuckets` 의 `Planned` 필드명을 **`TBS`** 로 변경
- `computeOmmSub1StatusBuckets` 결과 키 `Planned` → `TBS`
- `classifyOmmSub1Status` 반환값 `'Planned'` → `'TBS'`
- 신규 `OmmSub2StatusBuckets`, `computeOmmSub2StatusBuckets`, `classifyOmmSub2Status` (sub1 → sub2 치환, TBS 동일)
- `OMM_VISIBLE_STAGE_KEYS` 에서 `omm.sub2_review` 제거

**2. `src/lib/docs-dashboard-filter.ts`**
- `DashboardFilterParams.sub1_status` 타입에서 `'Planned'` → `'TBS'`
- `sub2_status?: 'A'|'B'|'C'|'UR'|'TBS'` 추가
- `computeDashboardFilteredIds` OMM 분기:
  - sub1_status === 'TBS' → `!sub1_actual_date` 필터
  - sub2_status 분기 신규 (동일 패턴)

**3. `src/pages/docs/DocsExecutiveDashboardPage.tsx`**
- `OmmSub1StatusCard` 의 칩 라벨 `Planned` → `TBS`
- `OmmSub2StatusCard` 신규 (1st 와 동일 컴포넌트 구조, 헤더 "2nd Status", 쿼리 파라미터 `sub2_status`)
- OMM Stage Progress 렌더 순서: `[Sub1Status, sub2_submission, Sub2Status, final_submission, final_approval]`
- 그리드 5컬럼 유지

**4. `src/pages/docs/DocsOMMRawDataPage.tsx`**
- `DOCS_DRILLDOWN_PARAMS` 에 `'sub2_status'` 추가
- 기존 `sub1_status` 필터 처리에서 'Planned' 비교 값을 'TBS' 로 변경

### 영향 범위

- 색상: TBS = muted (기존 Planned 와 동일 톤 유지)
- ABD/Warranty 영향 없음
- 라벨/타입만 변경, 비즈니스 로직 동일
