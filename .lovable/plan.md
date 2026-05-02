## 문제 진단

업로드 중 18건이 다음 에러로 거부되었습니다:
```
[23505] duplicate key value violates unique constraint "subtests_subtest_id_key"
```

### 근본 원인

`subtests` 테이블에는 두 개의 UNIQUE 제약이 있습니다:

1. `subtests_project_id_system_id_item_no_mos_code_key` — **(project_id, system_id, item_no, mos_code)** 조합 (의도된 비즈니스 키)
2. `subtests_subtest_id_key` — **(subtest_id)** 컬럼 단독 (전역 unique) ← **문제의 원인**

`subtest_id`는 import-parser에서 `${item_no}-${mos_code}` 형태로 생성됩니다 (예: `M-001-T1`). 그런데 이 값이 **전역(global) 단일값**으로 강제되어 있어서:

- **같은 item_no + mos_code 조합이 다른 system_id 또는 다른 project**에 존재하면 충돌
- import-parser의 prefetch는 `(system_id, item_no, mos_code)` 키로만 기존 행을 찾기 때문에, **같은 item_no/mos_code가 다른 system 아래에 이미 있는 경우** 새 INSERT로 시도되고 → 23505 발생
- bulk-actions의 Duplicate 기능에서 만드는 `${item_no}-${mos_code}-${seq}` 형식과의 잠재적 충돌도 가능

현재 DB 상태(중복 row 0건)를 확인했으므로, 제약을 변경해도 즉시 안전합니다.

### 해결 방향

`subtest_id`의 의미는 "프로젝트 내에서 사람이 알아보는 식별자"이지, **전역 유일 키일 필요가 없습니다.** 비즈니스 키는 이미 `(project_id, system_id, item_no, mos_code)`가 담당합니다.

## 수정 계획

### 1. DB 마이그레이션 — `subtest_id` 유니크 범위 축소

```sql
-- 전역 unique 제거
ALTER TABLE public.subtests DROP CONSTRAINT IF EXISTS subtests_subtest_id_key;

-- project 범위 unique로 대체 (활성 행에 한해)
CREATE UNIQUE INDEX IF NOT EXISTS subtests_project_subtest_id_key
  ON public.subtests (project_id, subtest_id)
  WHERE is_active = true;
```

이유:
- 동일 프로젝트 내에서는 `subtest_id`가 사람이 식별하는 코드이므로 unique 유지가 맞음
- 다른 프로젝트끼리는 같은 코드(예: `M-001-T1`)를 써도 무방
- `is_active = true` 부분 인덱스로 soft-delete된 행과 충돌 없음

### 2. Import 로직 보강 (`src/contexts/ImportContext.tsx`)

INSERT 시 만에 하나 동일 (project, system, item, mos) 행이 prefetch 이후에 다른 동시 import로 생긴 경우를 대비해 `.upsert(..., { onConflict: 'project_id,system_id,item_no,mos_code', ignoreDuplicates: true })` 또는 명시적 재조회 후 update fallback 처리. 이번 fix에선 단순화를 위해 INSERT를 `upsert(..., { onConflict: 'project_id,system_id,item_no,mos_code' })`로 변경.

### 3. Bulk Duplicate 보강 (`src/lib/bulk-actions.ts`)

`subtest_id` 생성 시 동일 project 내에 이미 같은 코드가 있으면 `-{seq}`를 추가하여 충돌 회피. 현재는 `${item_no}-${mos_code}-${seq}` 포맷이라 새 unique(project_id, subtest_id) 제약과 잘 맞지만, 안전망으로 INSERT를 chunk별로 시도하고 23505 발생 시 seq를 1 증가시켜 재시도하는 retry 1회 추가.

### 4. 사용자 안내 (Import 결과 패널)

기존 "Rejected (invalid)" 카드에서 23505 에러는 별도 그룹("Conflict — please re-import after fix")으로 표시하도록 reason_detail을 가공 (UI 변경은 최소).

## 테스트 절차 (구현 후)

1. 동일 엑셀을 재업로드 → 0 rejected (insert_failed) 기대
2. 다른 시스템에 동일 item_no/mos_code 존재하는 케이스 → 정상 INSERT
3. 같은 project 내 (system, item, mos)는 동일하지만 row가 이미 있는 경우 → UPDATE 경로 적중
4. Duplicate 기능 → 새 mos_sequence로 정상 생성

## 변경 파일

- `supabase/migrations/<new>.sql` (제약 변경)
- `src/contexts/ImportContext.tsx` (INSERT → upsert with onConflict)
- `src/lib/bulk-actions.ts` (Duplicate 23505 retry)

## 사용자 결정 필요

이번 fix는 **`subtest_id`를 프로젝트 내에서만 unique**로 바꿉니다. 만약 회사 표준상 `subtest_id`가 **모든 프로젝트를 통틀어 전역 unique**여야 한다면 알려주세요. 그 경우 대신 import-parser에서 충돌 시 자동 suffix(`-2`, `-3`)를 붙이는 방향으로 변경하겠습니다.
