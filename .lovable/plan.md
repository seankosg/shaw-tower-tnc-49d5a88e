# ABD Completed 불일치 — 원인 확인 및 수정안

## 원인 (확인됨)

`src/lib/docs-dashboard-data.ts`에 명시된 SSOT 주석:

> `approved_date` and `sub1_approval_date` are imported as **planned target dates** for nearly all rows, so they cannot be used as actual approval signals. Use only `sub*_approval_status='A'`.

즉 대시보드는 **승인 판정을 오직 `sub1/2/3_approval_status === 'A'`** 로만 합니다.

그런데 `src/lib/report-builder.ts`의 `computeDocsData` (라인 621, 642~660)는 ABD 모든 컬럼을 일률적으로 "값이 null 아니면 카운트" 방식으로 집계합니다:

```ts
const ABD_COLS = ['sub1_submission_date','sub1_approval_date','sub2_submission_date',
                  'sub2_approval_date','sub3_submission_date','sub3_approval_date',
                  'approved_date'];
```

따라서 `approved_date` (= 계획 응답일/Planned)가 채워진 행이 전부 "Approved/Completed"로 잡혀 대시보드보다 **부풀려진 수치**가 리포트에 들어갑니다. 사용자가 의심한 그대로 **Planned Respond Date를 실적으로 미리 셈하고 있던 버그**입니다.

OMM/Warranty/Spare Part는 `*_actual_date` 컬럼만 사용 → 영향 없음. 수정은 ABD 한 곳만.

## 수정안 (단일 파일: `src/lib/report-builder.ts`)

1. `AbdRow` 인터페이스와 ABD fetch SELECT 절에 `sub1_approval_status, sub2_approval_status, sub3_approval_status` 3개 컬럼 추가.
2. ABD는 `mk()` 일반 루프 대신 전용 카운트 적용:
   - `sub1/2/3_submission_date` → 기존대로 `value != null` 로 카운트 (대시보드 funnel의 Sub1/Sub2/Sub3 단계와 동일).
   - `sub1/2/3_approval_date` → **해당 단계의 `*_approval_status === 'A'`** 인 행 수로 교체.
   - `approved_date` (= 리포트의 Completed/Approved) → 대시보드 funnel "Approved" 정의와 동일하게 **`sub3_status==='A' OR sub2_status==='A' OR sub1_status==='A'`** 인 행 수로 교체.
3. `abdData.currentPcts / currentCounts / statusCounts` 모두 위 새 카운트를 따르도록 갱신. `not_submitted = !sub1_submission_date` 는 변경 없음.
4. **Snapshots 처리**: `*_approval_date`/`approved_date`는 실제 승인일이 아니므로 과거 시점 재구성이 불가합니다. ABD snapshot 테이블에서 Apv 컬럼들을 제거하고 **Sub1/Sub2/Sub3 Submission %만 남깁니다.** (대시보드도 승인 스냅샷을 제공하지 않음.) 다른 처리를 원하시면 알려주세요.

## 검증

- `bunx tsc --noEmit` 통과 확인.
- 리포트 생성 후 ABD Approved/Completed 수치가 대시보드 KPI 카드와 일치하는지 사용자 확인.

## 영향 범위

- `src/lib/report-builder.ts` 만 수정. 대시보드 / 다른 모듈 / DB 변경 없음.
