## 목표

1. **R2 를 두 단계로 분리**: R2-Submission (`r2s`) 과 R2-Approval (`r2a`) 을 매트릭스 stage 로 별도 표시
2. R1/R2 actual 일자 입력 시 status 자동 정규화 (이전 요청)
3. R2 status 를 `Planned / Submitted / Approved` 3단계로 단순화 (이전 요청)

### 매트릭스 stage 구성 (변경 후)

| 표시 라벨 | 내부 key | Plan 일자 컬럼 | Actual 일자 컬럼 | Done 판정 |
|---|---|---|---|---|
| Pred | `pred` | `pred_planned_date` | `pred_actual_date` | status='Done' or raw |
| T1 | `t1` | `t1_planned_date` | `t1_actual_date` | t1_status='Done' |
| T2 | `t2` | `t2_planned_date` | `t2_actual_date` | t2_status='Done' |
| **R1S** | `r1` | `r1_target_submission_date` | `r1_actual_submission_date` | r1_status ≥ Submitted |
| **R2S** *(신규)* | `r2s` | `r2_target_submission_date` | `r2_actual_submission_date` | r2_status ∈ {Submitted, Approved} |
| **R2A** | `r2a` *(키 변경: r2 → r2a)* | `r2_target_approval_date` | `r2_actual_approval_date` | r2_status='Approved' |

→ **총 6 단계** (기존 5 → 6)

> 컬럼은 모두 이미 `subtests` 테이블에 존재하므로 DB 스키마 추가는 불필요.

---

## R2 status 자동 정규화 규칙

**R2 status: `Planned / Submitted / Approved` (3단계)**, 승인일 우선 평가:

| `r2_actual_approval_date` | `r2_actual_submission_date` | 입력 `r2_status` | 결과 |
|---|---|---|---|
| 값 있음 | — | NULL | `Approved` |
| NULL | 값 있음 | NULL | `Submitted` |
| 어떤 경우든 | 어떤 경우든 | 값 있음 | 그대로 유지 |
| NULL | NULL | 어떤 값이든 | 변경 없음 |

**R1**: `r1_actual_submission_date` 있고 `r1_status` NULL → `Submitted` 자동 설정.

→ 단일 r2_status 컬럼으로 R2S, R2A 두 stage 의 done 판정을 모두 결정 (R2S 는 Submitted 이상이면 done, R2A 는 Approved 만 done).

---

## 변경 내역

### 1. DB 마이그레이션 — 자동 정규화 트리거

```sql
CREATE OR REPLACE FUNCTION public.normalize_report_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.r1_actual_submission_date IS NOT NULL AND NEW.r1_status IS NULL THEN
    NEW.r1_status := 'Submitted'::report_status;
  END IF;
  IF NEW.r2_status IS NULL THEN
    IF NEW.r2_actual_approval_date IS NOT NULL THEN
      NEW.r2_status := 'Approved'::report_status;
    ELSIF NEW.r2_actual_submission_date IS NOT NULL THEN
      NEW.r2_status := 'Submitted'::report_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_report_status
BEFORE INSERT OR UPDATE OF
  r1_status, r1_actual_submission_date,
  r2_status, r2_actual_submission_date, r2_actual_approval_date
ON public.subtests
FOR EACH ROW EXECUTE FUNCTION public.normalize_report_status();
```

기존 데이터 백필 (안전망):
```sql
UPDATE public.subtests SET r1_status='Submitted'
  WHERE r1_actual_submission_date IS NOT NULL AND r1_status IS NULL AND is_active=true;
UPDATE public.subtests SET r2_status='Approved'
  WHERE r2_actual_approval_date IS NOT NULL AND r2_status IS NULL AND is_active=true;
UPDATE public.subtests SET r2_status='Submitted'
  WHERE r2_actual_submission_date IS NOT NULL AND r2_actual_approval_date IS NULL
    AND r2_status IS NULL AND is_active=true;
```

### 2. `src/types/enums.ts` — R2 옵션 3단계화

```ts
export const R1_STATUS_OPTIONS: ReportStatus[] =
  ['Planned', 'Submitted', 'Under Review', 'Approved', 'Returned'];
export const R2_STATUS_OPTIONS: ReportStatus[] =
  ['Planned', 'Submitted', 'Approved'];
```
- `REPORT_STATUS_OPTIONS` 는 enum 전체값 유지 (레거시 호환)
- `isR2Done(status)` 기존 정의(`status === 'Approved'`) 유지
- 신규 `isR2Submitted(status)` 추가: `status ∈ {Submitted, Approved}`

### 3. `src/lib/stage-metrics.ts` — StageKey 확장 (`r2` → `r2s` + `r2a`)

```ts
export type StageKey = 'pred' | 't1' | 't2' | 'r1' | 'r2s' | 'r2a';

export function getStagePlannedDate(row, stage) {
  ...
  if (stage === 'r1')  return row.r1_target_submission_date ?? null;
  if (stage === 'r2s') return row.r2_target_submission_date ?? null;
  if (stage === 'r2a') return row.r2_target_approval_date ?? null;
}

export function getStageActualDate(row, stage) {
  if (!isStageDone(row, stage)) return null;
  ...
  if (stage === 'r1')  return row.r1_actual_submission_date ?? null;
  if (stage === 'r2s') return row.r2_actual_submission_date ?? null;
  if (stage === 'r2a') return row.r2_actual_approval_date ?? null;
}

export function isStageDone(row, stage) {
  if (stage === 'r1')  {
    if (row.r1_status == null && row.r1_actual_submission_date) return true;
    return reportIsR1Done(row.r1_status ?? null);
  }
  if (stage === 'r2s') {
    if (row.r2_status == null && row.r2_actual_submission_date) return true;
    return reportIsR2Submitted(row.r2_status ?? null); // Submitted or Approved
  }
  if (stage === 'r2a') {
    if (row.r2_status == null && row.r2_actual_approval_date) return true;
    return reportIsR2Done(row.r2_status ?? null);      // Approved only
  }
  // ... pred/t1/t2 변경 없음
}

export function getStageKeys(filter) {
  return filter === 'all'
    ? ['pred', 't1', 't2', 'r1', 'r2s', 'r2a']
    : [filter];
}
```

### 4. `src/lib/schedule-utils.ts` — STAGE_LABELS 갱신

```ts
export const STAGE_LABELS: Record<ScheduleStage, string> = {
  pred: 'Pred',
  t1: 'T1',
  t2: 'T2',
  r1: 'R1S',
  r2s: 'R2S',
  r2a: 'R2A',
};
```

### 5. `src/pages/SchedulePage.tsx` — Stage 필터 탭

```tsx
<TabsTrigger value="r1"  className="h-6 px-2 text-xs">R1S</TabsTrigger>
<TabsTrigger value="r2s" className="h-6 px-2 text-xs">R2S</TabsTrigger>
<TabsTrigger value="r2a" className="h-6 px-2 text-xs">R2A</TabsTrigger>
```

기존 select 컬럼은 이미 R1/R2 전체 컬럼 포함되어 있어 추가 변경 불필요.

### 6. `src/components/schedule/ScheduleMatrix.tsx`

- stage 배열: `['pred','t1','t2','r1','r2']` → `['pred','t1','t2','r1','r2s','r2a']`
- 분모 라벨: `'... × 5'` → `'Pred + T1 + T2 + R1S + R2S + R2A progress / (subtests × 6)'`
- stage 뱃지 색상: `r2s` → cyan(또는 teal) 추가, `r2a` 는 기존 emerald 유지

```tsx
st === 'r1'  && 'bg-amber-500/15 text-amber-700 ...',
st === 'r2s' && 'bg-cyan-500/15 text-cyan-700 ...',     // 신규
st === 'r2a' && 'bg-emerald-500/15 text-emerald-700 ...',
```

### 7. `src/components/schedule/CriticalWatchlist.tsx`

- `CriticalItem.stage` 타입 자동으로 `r2s | r2a` 포함 (StageKey 확장 효과)
- 뱃지 라벨은 `STAGE_LABELS[item.stage]` 로 통일 (이미 변경 예정)
- 색상 매핑에 `r2s` 추가

### 8. `src/lib/schedule-excel-export.ts`

- stage 배열: `['pred','t1','t2','r1','r2']` → `['pred','t1','t2','r1','r2s','r2a']`
- sub-row 라벨은 `STAGE_LABELS` 참조 → 자동으로 `R1S / R2S / R2A` 표시

### 9. `src/lib/schedule-cache.ts`

- cache schema version 키를 한 단계 올림 → 기존 캐시(5 stage) 자동 무효화 후 6 stage 로 재집계

---

## 적용 범위 / 비범위

- ✅ Progress 매트릭스 (R2S, R2A 별도 행)
- ✅ Stage 필터 탭에 R2S 추가
- ✅ Critical Watchlist (R2S 미완료 항목도 horizon 내 high-risk 검출)
- ✅ Excel export sub-row 6개 (Pred/T1/T2/R1S/R2S/R2A)
- ✅ KPI 분모 × 6
- ✅ Status 자동 정규화 (DB 트리거 + 클라이언트 fallback)
- ❌ DB 컬럼 추가 없음 (기존 `r2_target_submission_date` / `r2_actual_submission_date` 사용)
- ❌ R2 status 컬럼 분리 없음 (단일 `r2_status` 로 두 단계 done 판정)
- ❌ T&C Dashboard, Defect 모듈 변경 없음

---

## 검증 시나리오

1. `r2_target_submission_date` 만 있는 subtest → R2S 행 plan 셀 +1, R2A plan 셀 0
2. `r2_target_approval_date` 만 있는 subtest → R2A 행 plan 셀 +1, R2S plan 셀 0
3. `r2_actual_submission_date` 입력 → r2_status 가 NULL 이면 자동 `Submitted` → R2S Done, R2A 미완료
4. `r2_actual_approval_date` 추가 입력 → r2_status `Submitted` → 사용자가 `Approved` 로 명시 변경 후 R2A Done
5. R2 status 드롭다운에 `Planned / Submitted / Approved` 3개만 노출
6. Stage 필터 탭에 `R1S / R2S / R2A` 모두 표시
7. Excel export: stageFilter=all 일 때 그룹 아래 6개 sub-row
8. Critical Watchlist 가 R2S horizon 내 미제출 항목도 검출
