

## 변경 목표

Import 시 기존 Subtest의 Planned Date가 변경되는 경우 업데이트는 정상 수행하되, 변경된 일정 정보를 Import History에서 다음 구조로 보여줍니다.

핵심 UI는 `Pred / T1 / T2` 그룹 컬럼으로 구성합니다.

```text
Test 정보 | Pred 그룹 | T1 그룹 | T2 그룹
```

각 그룹 아래에는 동일하게 아래 컬럼을 둡니다.

```text
Old date
New date
Diff
Prev.Gap
Cur.Gap
```

## UI 표시 규칙

### 1. Pred / T1 / T2 그룹별 컬럼 구조

Import History의 Schedule Changes 화면에 아래와 같이 표시합니다.

```text
System | Item No | MOS Code | Subtest ID
       | Pred Old | Pred New | Pred Diff | Pred Prev.Gap | Pred Cur.Gap
       | T1 Old   | T1 New   | T1 Diff   | T1 Prev.Gap   | T1 Cur.Gap
       | T2 Old   | T2 New   | T2 Diff   | T2 Prev.Gap   | T2 Cur.Gap
```

화면에서는 Header를 2단으로 구성합니다.

```text
┌──────────── Test ────────────┬──────────── Pred ────────────┬──────────── T1 ────────────┬──────────── T2 ────────────┐
│ System | Item | MOS | Subtest│ Old | New | Diff | Prev | Cur │ Old | New | Diff | Prev | Cur│ Old | New | Diff | Prev | Cur│
```

### 2. 해당되는 Stage 컬럼에만 값 표시

변경된 Planned Date가 있는 Stage 그룹에만 값을 표시합니다.

예시: T1 Planned Date만 변경된 경우

```text
Pred Old/New/Diff/Prev.Gap/Cur.Gap = null
T1 Old/New/Diff/Prev.Gap/Cur.Gap   = 값 표시
T2 Old/New/Diff/Prev.Gap/Cur.Gap   = null
```

화면 표시 예시:

```text
System | Item | MOS | Subtest | Pred... | T1 Old | T1 New | T1 Diff | T1 Prev.Gap | T1 Cur.Gap | T2...
A01    | 1001 | M01 | ST-001  | —       | 25-Apr | 28-Apr | +3      | 10          | 7          | —
```

### 3. Diff 계산 기준

`Diff`는 신규 날짜에서 기존 날짜를 뺀 숫자입니다.

```text
Diff = New date - Old date
```

표시 규칙:

```text
양수: 일정 지연
음수: 일정 단축
0: 날짜 변화 없음
```

예시:

```text
Old date = 2026-04-25
New date = 2026-04-28
Diff = +3
→ 3일 지연

Old date = 2026-04-28
New date = 2026-04-25
Diff = -3
→ 3일 단축
```

UI에서는 숫자 형식으로 표시합니다.

```text
+3
-3
0
```

### 4. Prev.Gap / Cur.Gap 계산 기준

`Prev.Gap`은 변경 전 기준으로, 해당 Stage와 다음 Stage 사이의 간격입니다.

`Cur.Gap`은 변경 후 기준으로, 해당 Stage와 다음 Stage 사이의 간격입니다.

```text
Prev.Gap = 다음 Stage Planned Date - 기존 Planned Date
Cur.Gap  = 다음 Stage Planned Date - 신규 Planned Date
```

Stage별 다음 단계 기준:

```text
Pred → 다음 단계는 T1
T1   → 다음 단계는 T2
T2   → 다음 단계 없음
```

따라서 T2 변경 시:

```text
T2 Old date = 표시
T2 New date = 표시
T2 Diff = 표시
T2 Prev.Gap = null
T2 Cur.Gap = null
```

### 5. Gap 예시

T1이 변경된 경우:

```text
기존 T1 Planned Date = 2026-04-25
신규 T1 Planned Date = 2026-04-28
T2 Planned Date      = 2026-05-05
```

계산:

```text
Diff     = 2026-04-28 - 2026-04-25 = +3
Prev.Gap = 2026-05-05 - 2026-04-25 = 10
Cur.Gap  = 2026-05-05 - 2026-04-28 = 7
```

표시:

```text
T1 Old date | T1 New date | T1 Diff | T1 Prev.Gap | T1 Cur.Gap
25-Apr      | 28-Apr      | +3      | 10           | 7
```

## 데이터 저장 방식

### 1. 신규 Schedule Change Audit 테이블 추가

Import History에서 안정적으로 조회하기 위해 일정 변경 전용 테이블을 추가합니다.

테이블명:

```text
schedule_change_audit
```

저장 컬럼:

```text
id
upload_id
subtest_id
project_id
system_id
item_no
mos_code
subtest_code 또는 subtest_id_text
raw_row_no

pred_old_date
pred_new_date
pred_diff_days
pred_prev_gap_days
pred_cur_gap_days

t1_old_date
t1_new_date
t1_diff_days
t1_prev_gap_days
t1_cur_gap_days

t2_old_date
t2_new_date
t2_diff_days
t2_prev_gap_days
t2_cur_gap_days

created_by
created_at
```

이 구조를 사용하면 한 row에서 Pred/T1/T2 중 여러 날짜가 동시에 변경되어도 한 줄에 함께 표시할 수 있습니다.

예시:

```text
한 Subtest에서 Pred와 T1이 동시에 변경됨
→ schedule_change_audit row 1개
→ Pred 그룹과 T1 그룹에 값 표시
→ T2 그룹은 null
```

### 2. RLS 정책

조회:

```text
로그인 사용자는 조회 가능
```

Insert:

```text
Import를 수행한 사용자 또는 Admin/Superuser 가능
```

관리:

```text
Admin/Superuser 가능
```

## Import 처리 로직

### 1. 기존 Subtest 조회 확장

현재 Import 업데이트 시 기존 Subtest를 조회합니다.

이때 Planned Date 비교에 필요한 필드를 함께 조회합니다.

```text
id
project_id
system_id
item_no
mos_code
subtest_id
row_version
pred_planned_date
t1_planned_date
t2_planned_date
```

### 2. 업데이트 전 변경 감지

Import row에서 Planned Date가 들어온 경우에만 비교합니다.

비어 있는 값은 기존 blank overwrite 방지 정책에 따라 변경으로 보지 않습니다.

비교 대상:

```text
pred_planned_date
t1_planned_date
t2_planned_date
```

### 3. 변경 값 계산

각 Stage별로 변경이 있으면 아래 값을 계산합니다.

```text
Old date
New date
Diff
Prev.Gap
Cur.Gap
```

Pred:

```text
Diff = new_pred - old_pred
Prev.Gap = existing_t1 - old_pred
Cur.Gap = final_t1 - new_pred
```

T1:

```text
Diff = new_t1 - old_t1
Prev.Gap = existing_t2 - old_t1
Cur.Gap = final_t2 - new_t1
```

T2:

```text
Diff = new_t2 - old_t2
Prev.Gap = null
Cur.Gap = null
```

`final_t1`, `final_t2`는 같은 Import row에서 후속 Stage도 함께 변경되는 경우를 고려한 최종값입니다.

예시:

```text
T1과 T2가 동시에 변경됨
→ T1 Cur.Gap은 변경 후 T2 날짜 기준으로 계산
```

### 4. 업데이트 성공 시에만 Audit 저장

Import update가 성공한 경우에만 `schedule_change_audit`에 기록합니다.

업데이트 실패 시에는 기록하지 않습니다.

```text
subtests update 성공
→ schedule_change_audit insert
→ upload_row_logs insert
→ subtest_change_log insert
```

## Import History 화면 변경

`src/pages/ImportLogsPage.tsx`에 선택된 Batch 상세 화면을 확장합니다.

현재:

```text
Import Row Details
```

변경 후:

```text
Import Row Details
- Row Logs
- Schedule Changes
```

Schedule Changes에는 신규 테이블 데이터를 표시합니다.

컬럼 구성:

```text
System
Item No
MOS Code
Subtest ID

Pred
  Old date
  New date
  Diff
  Prev.Gap
  Cur.Gap

T1
  Old date
  New date
  Diff
  Prev.Gap
  Cur.Gap

T2
  Old date
  New date
  Diff
  Prev.Gap
  Cur.Gap
```

값이 없는 컬럼은 `—` 또는 빈 값으로 표시합니다.

## Subtest 상세 Change History 연동

기존 `subtest_change_log`에도 Planned Date 변경 이력을 남깁니다.

예시:

```text
changed_field: t1_planned_date
old_value: 2026-04-25
new_value: 2026-04-28
change_source: excel_import
upload_id: 현재 upload batch id
```

따라서 사용자는 두 곳에서 확인할 수 있습니다.

```text
Import History
→ 파일 단위 일정 변경 영향 확인

Subtest Detail
→ 개별 Subtest 변경 이력 확인
```

## 수정 예상 파일

```text
src/contexts/ImportContext.tsx
src/pages/ImportLogsPage.tsx
src/pages/SubtestDetail.tsx
src/lib/format.ts
신규: src/lib/schedule-change-utils.ts
```

DB 변경:

```text
schedule_change_audit 테이블 추가
RLS 정책 추가
조회 성능용 index 추가
```

자동 생성 파일은 직접 수정하지 않습니다.

```text
src/integrations/supabase/types.ts 직접 수정 없음
src/integrations/supabase/client.ts 직접 수정 없음
```

## 최종 동작

```text
Import 파일 업로드
→ 기존 Subtest와 Planned Date 비교
→ 변경된 Planned Date는 업데이트
→ Pred/T1/T2별 Old/New/Diff/Prev.Gap/Cur.Gap 계산
→ 변경된 Stage 그룹에만 값 저장
→ 나머지 Stage 그룹은 null
→ Import History > Schedule Changes에서 확인
```

예시:

```text
T1만 변경된 경우

Pred: null
T1:
  Old date: 25-Apr
  New date: 28-Apr
  Diff: +3
  Prev.Gap: 10
  Cur.Gap: 7
T2: null
```

