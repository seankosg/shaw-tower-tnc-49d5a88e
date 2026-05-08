## Goal
Redefine the **Done** KPI on the ABD module card so it represents "할일 다한 도면" = **Approved + Under Review** (Stage Distribution 기준), not just final-approved.

## Current behavior (ABD)
- `Done` = `is_completed` = 마지막 stage(`abd.approved`)가 done인 행 수 = 258 (Approved 버킷과 동일).
- Stage Distribution: Approved 258 + Under Review 1,630 + Submission Required 1,903 = 3,791.

## New behavior (ABD only)
- `Done` = Approved + Under Review = **258 + 1,630 = 1,888**.
- Sublabel: `{pct}% complete` 그대로 (재계산: 1888/3791 ≈ 50%).
- Click 시 Raw Data 이동: 새 가상 bucket `done`(= approved ∪ under_review)으로 필터.
- OMM/Warranty는 변경 없음 (기존 `is_completed` 유지).

## Changes

### 1. `src/pages/docs/DocsExecutiveDashboardPage.tsx`
- ABD인 경우 `done` 값을 `abdBuckets.approved + abdBuckets.under_review`로 override (모듈 전체 기준이므로 tab-unfiltered `abdRows` 사용 — 별도 `computeAbdBucketDistribution(abdRows)` 호출).
- ABD `Done` 타일의 `onClick` → `onNavigate('abd', { bucket: 'done' })`.

### 2. `src/lib/docs-dashboard-filter.ts`
- `bucket` 파라미터 값 `'done'` 추가 → `classifyAbdRowBucket(row)` 결과가 `approved` 또는 `under_review`면 매칭.

### 3. `src/pages/docs/DocsRawDataPage.tsx`
- `DOCS_DRILLDOWN_PARAMS` / `clearDashboardFilter`의 bucket 처리에 `'done'` 추가 (기존 패턴 그대로 확장).

## Out of scope
- OMM/Warranty Done 정의 변경
- Stage Distribution 카드 자체 변경
- Total/Overdue 정의 변경
