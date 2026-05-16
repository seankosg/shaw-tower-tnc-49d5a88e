## 진단 (planned vs actual 재확인)

DB의 `docs_drawings` (as_built, active 3,864건) 컬럼 분포를 확인한 결과, **다수의 컬럼이 planned 값을 actual 컬럼에 채워 임포트되어 있어 신뢰할 수 없습니다.**

| 컬럼 | non-null 건수 | 신뢰 여부 |
|---|---|---|
| `is_submitted` / `submitted_date` | 2,338 | 신뢰 (실제 제출 플래그) |
| 임의 `sub*_submission_date` | **2,895** | 신뢰 (실제 제출일자) |
| `sub1_approval_date` | 3,862 | **불신** (사실상 모든 행 → planned 값) |
| `sub2_approval_date` | 17 | 신뢰 |
| `sub3_approval_date` | 0 | — |
| `approved_date` | 3,861 | **불신** (planned final approval target) |
| `sub1_approval_status='A'` | 443 | 신뢰 (실 승인) |
| `sub2/sub3_approval_status='A'` | 0 | — |

→ Total 3,864 − any-submission 2,895 = **미제출 969건** (사용자가 말한 "998"과 일치)

현재 Executive Dashboard ABD Completed가 ~100%인 이유:
- `src/lib/docs-stage-records.ts`의 `buildAbdStageRecords`에서 최종 단계 `done` 판정이
  `finalApproved = sub3_approval_status='A' || !!approved_date` 로 되어 있고, `approved_date`가 거의 모든 행에 planned 값으로 채워져 있어 `is_completed=true`가 거의 모든 행에 마킹됨.
- 동일 문제로 stage `done` 플래그들(`sub1/2/3_approval_date` 기반)도 planned 값을 actual로 잘못 인식.
- `src/lib/docs-dashboard-data.ts`의 funnel stage 판정(`approved_date`)과 Approval Trend(`approved_date` 기반)도 동일 오염.

## 수정 방향 (planned/actual 엄격 분리)

### 1) `src/lib/docs-stage-records.ts` — `buildAbdStageRecords`

ABD에 한해, **approval actual 신호는 `sub*_approval_status='A'`만 신뢰**하고, `sub*_approval_date` / `approved_date`는 actual로 사용하지 않습니다 (현장 데이터 품질이 회복될 때까지 안전 측 정책).

- `finalApproved` 재정의:
  ```ts
  const sub1ApprovedStatus = String(row.sub1_approval_status ?? '').toUpperCase() === 'A';
  const sub2ApprovedStatus = String(row.sub2_approval_status ?? '').toUpperCase() === 'A';
  const sub3ApprovedStatus = String(row.sub3_approval_status ?? '').toUpperCase() === 'A';
  const finalApproved = sub1ApprovedStatus || sub2ApprovedStatus || sub3ApprovedStatus;
  ```
  (`approved_date` 사용 제거)

- 각 review 단계 `done` 플래그를 status 기반으로 변경 — status가 A/B/C 중 하나일 때만 review 완료로 인정 (현재 코드는 `*_approval_date` non-null 이면 done):
  ```ts
  const reviewDone = (s: string | null | undefined) => {
    const v = String(s ?? '').trim().toUpperCase();
    return v === 'A' || v === 'B' || v === 'C';
  };
  // ABD_STAGE_DEFS[1] (1st Review) done: reviewDone(row.sub1_approval_status)
  // ABD_STAGE_DEFS[3] (2nd Review) done: reviewDone(row.sub2_approval_status)
  // ABD_STAGE_DEFS[5] (3rd Review) done: reviewDone(row.sub3_approval_status)
  ```
  `actual_date`로 기록할 값은 status가 결정된 경우에만 `sub*_approval_date`를 노출 (그 외 null).

- Submission 단계 `done`은 현행 유지 (`sub*_submission_date` non-null = actual 제출 → 신뢰 가능).

- 마지막 `ABD_STAGE_DEFS[6]` (Approved) 단계 `done` 플래그를 사용자 정의("Submitted OR Approved")에 맞춤:
  ```ts
  done: finalApproved
        || !!row.sub1_submission_date
        || !!row.sub2_submission_date
        || !!row.sub3_submission_date,
  actual: finalApproved
        ? (sub3ApprovedStatus ? row.sub3_approval_date
           : sub2ApprovedStatus ? row.sub2_approval_date
           : row.sub1_approval_date)
        : null, // 미승인 시 actual 없음(미제출/제출중)
  ```
  이로써 `summariseByItem`의 `is_completed`가 "submitted or approved" 카운트와 일치.

- `current_stage` 라벨 계산도 동일 원칙으로 정리: `sub1Approved/sub2Approved` 변수를 status 기반으로 통일(이미 status 기반임 — 유지), `finalApproved` 분기만 위 정의로 교체.

### 2) `src/lib/docs-dashboard-data.ts` — ABD 섹션

- Funnel stage 판정에서 `approved_date` 제거:
  ```ts
  if (sub3ApprStatus==='A' || sub2ApprStatus==='A' || sub1ApprStatus==='A') stage = 'Approved';
  ```
- Approval Trend 누적:
  ```ts
  // approved_date 사용 금지. status='A'인 단계의 approval_date만 사용.
  const approved =
    sub3ApprStatus==='A' ? safeIso(row.sub3_approval_date)
    : sub2ApprStatus==='A' ? safeIso(row.sub2_approval_date)
    : sub1ApprStatus==='A' ? safeIso(row.sub1_approval_date)
    : null;
  ```
- ABD 카드의 `submitted`는 현행 `is_submitted` 그대로 유지 (별도 KPI, 본 이슈와 별개).

### 3) OMM / Spare Part / Warranty
변경 없음. 이번 수정 범위는 ABD planned/actual 오염 문제에 한정.

## 검증

1. 코드 변경 후 Docs Executive Dashboard 진입:
   - ABD Completed ≈ **2,895 / 3,864 (~75%)**
   - Remaining ≈ **969**
2. ABD Stage Progress 카드:
   - 1st/2nd/3rd Review 단계의 done 카운트가 status='A/B/C' 행 수와 일치 (1st Review ≈ 475, 2nd/3rd ≈ 0)
   - Approved 단계 done = Completed와 동일
3. Approval Trend 그래프가 더 이상 planned `approved_date` 봉우리를 그리지 않음
4. Raw Data 페이지의 행 수와 카운트 정합

## 변경 파일

- `src/lib/docs-stage-records.ts` — `buildAbdStageRecords`
- `src/lib/docs-dashboard-data.ts` — ABD funnel stage 및 approval trend 계산

## 변경하지 않는 것

- DB 스키마/마이그레이션 (데이터 정리는 별도 작업)
- OMM/Warranty/Spare Part 로직
- Docs 요약 대시보드의 KPI 카드(`is_submitted` 기반, 본 이슈 무관)
- Import 파서 (planned가 actual로 임포트되는 현상 자체 — 별도 이슈로 분리 권장)
