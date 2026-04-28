# One-off Migration: Reissue Subcontractor Issue Numbers

## Current State

- `defect_items` 활성 행: **2,935건** (모두 SC No 보유)
- 현재 SC No prefix(owner)와 실제 `subcontractor_name`/`subsub_name`에서 도출되는 owner_code가 **불일치하는 행: 849건** (29%)
- 가장 큰 변경 패턴: `HDEC → SYS` (145건), `GRB → SYS` (55건), `GRB → FINEBUILD` (51건) 등
- 해결 불가능한 행(UNASSIGNED 매핑) **0건** — 모든 불일치 행은 master 테이블에서 새 owner_code로 매핑 가능

## Goal

기존에 잘못 남아있던 SC No를 현재 `subcontractor_name`/`subsub_name`에 맞는 새 owner의 카운터에서 재발급하고, 변경 이력을 `sc_no_history`에 기록합니다. **일회성 SQL 마이그레이션**으로 처리합니다.

## Migration Logic

### 1. 새 owner_code 결정 규칙 (앱 로직과 동일)
1. `subsub_name`이 `subcontractor_master(type='subsub')`에 매칭되면 그 owner_code
2. 아니면 `subcontractor_name`이 `subcontractor_master(type='sub')`에 매칭되면 그 owner_code
3. 아니면 `team` 텍스트 (UPPER)
4. 그래도 없으면 `UNASSIGNED`

매칭은 `lower(btrim(name))` 기준 (현재 `master-name-match.ts` 로직과 동일).

### 2. 재배정 대상 선정
- 활성 행 중 `current_owner_code`(SC No prefix 파싱)와 `expected_owner_code`가 다른 행만 처리
- Issue No 오름차순으로 정렬 후 같은 새 owner끼리 그룹화 → 일관된 순번 부여

### 3. 새 SC No 발급
- 각 새 owner별로 `allot_subcontractor_issue_no(project_id, new_owner_code, group_size)` RPC를 호출하여 카운터에서 N개의 시퀀스를 원자적으로 받아옴 (앱 import 로직과 동일한 방식 → 카운터 정합성 유지)
- `SC-{NEW_OWNER}-{seq:05d}` 포맷으로 새 SC No 생성

### 4. 업데이트
각 대상 행에 대해:
- `defect_items.subcontractor_issue_no` ← 새 SC No
- `defect_items.subcontractor_issue_source` ← `'reissued_migration'`
- `defect_items.updated_at` ← now()
- `defect_items.row_version` ← +1

### 5. 이력 기록
각 대상 행에 대해 `sc_no_history`에 한 행 INSERT:
- `defect_id`, `issue_no`
- `old_subcontractor_issue_no`, `new_subcontractor_issue_no`
- `old_subcontractor_name` ← (변경 전 이름은 알 수 없으므로 NULL — 현재 `subcontractor_name`은 이미 새 값)
- `new_subcontractor_name` ← 현재 값
- `old_owner_code`, `new_owner_code`
- `reason` ← `'one_off_migration_2026_04'`
- `changed_by` ← NULL (시스템 마이그레이션)
- `changed_at` ← now() (default)

> 주의: `old_subcontractor_name`은 이미 import 시 덮어써져 사라졌으므로 NULL로 둡니다. 이력에는 owner_code 변경(SC prefix)이 명확히 남으므로 추적 가능합니다.

### 6. 안전 장치
- `DO $$ ... $$` 블록 안에서 모두 단일 트랜잭션으로 실행 → 중간 실패 시 전체 롤백
- 처리 전후 카운트를 RAISE NOTICE로 출력
- `subcontractor_issue_counters`는 `allot_subcontractor_issue_no` RPC가 직접 갱신하므로 별도 처리 불필요
- 비활성 행(`is_active = false`)은 처리하지 않음

## Implementation

단일 SQL 마이그레이션 파일로 작성. 핵심 구조:

```sql
DO $$
DECLARE
  rec RECORD;
  new_owner TEXT;
  new_seq INT;
  new_sc_no TEXT;
  total_done INT := 0;
BEGIN
  -- 새 owner별로 그룹핑하여 RPC 한 번에 N개 할당
  FOR rec IN
    WITH targets AS (
      SELECT d.id, d.project_id, d.issue_no, d.subcontractor_issue_no AS old_sc,
             d.subcontractor_name, d.subsub_name,
             upper((regexp_match(d.subcontractor_issue_no, '^SC-([A-Z0-9]+)-'))[1]) AS old_owner,
             upper(COALESCE(
               (SELECT owner_code FROM subcontractor_master m WHERE m.is_active AND m.type='subsub'
                 AND lower(btrim(m.name))=lower(btrim(d.subsub_name)) LIMIT 1),
               (SELECT owner_code FROM subcontractor_master m WHERE m.is_active AND (m.type='sub' OR m.type IS NULL)
                 AND lower(btrim(m.name))=lower(btrim(d.subcontractor_name)) LIMIT 1),
               'UNASSIGNED'
             )) AS new_owner
      FROM defect_items d WHERE d.is_active = true
    )
    SELECT * FROM targets
    WHERE old_owner IS DISTINCT FROM new_owner
    ORDER BY project_id, new_owner, issue_no
  LOOP
    -- per-row allocation (loop) — keeps logic simple and ordered
    SELECT (allot_subcontractor_issue_no(rec.project_id, rec.new_owner, 1))[1] INTO new_seq;
    new_sc_no := 'SC-' || rec.new_owner || '-' || lpad(new_seq::text, 5, '0');

    UPDATE defect_items
       SET subcontractor_issue_no = new_sc_no,
           subcontractor_issue_source = 'reissued_migration',
           updated_at = now(),
           row_version = row_version + 1
     WHERE id = rec.id;

    INSERT INTO sc_no_history (
      defect_id, issue_no,
      old_subcontractor_issue_no, new_subcontractor_issue_no,
      old_subcontractor_name, new_subcontractor_name,
      old_owner_code, new_owner_code,
      reason, changed_by
    ) VALUES (
      rec.id, rec.issue_no,
      rec.old_sc, new_sc_no,
      NULL, rec.subcontractor_name,
      rec.old_owner, rec.new_owner,
      'one_off_migration_2026_04', NULL
    );

    total_done := total_done + 1;
  END LOOP;

  RAISE NOTICE 'Reissued % rows', total_done;
END $$;
```

> 단순성을 위해 루프 1행씩 RPC 호출. 2,935행 중 849건 처리이므로 충분히 빠릅니다(수 초 이내).

## Verification (마이그레이션 후 자동 확인 쿼리)

```sql
-- 1. 더 이상 불일치 없는지
SELECT count(*) AS remaining_mismatches FROM defect_items d
 WHERE is_active=true
   AND upper((regexp_match(subcontractor_issue_no,'^SC-([A-Z0-9]+)-'))[1])
       IS DISTINCT FROM upper(COALESCE(
         (SELECT owner_code FROM subcontractor_master m WHERE m.type='subsub' AND m.is_active
           AND lower(btrim(m.name))=lower(btrim(d.subsub_name)) LIMIT 1),
         (SELECT owner_code FROM subcontractor_master m WHERE (m.type='sub' OR m.type IS NULL) AND m.is_active
           AND lower(btrim(m.name))=lower(btrim(d.subcontractor_name)) LIMIT 1),
         'UNASSIGNED'));
-- 기대: 0

-- 2. 새 SC No 중복 없는지
SELECT subcontractor_issue_no, count(*) FROM defect_items
 WHERE is_active=true GROUP BY 1 HAVING count(*)>1;
-- 기대: 0 rows

-- 3. 이력 기록 확인
SELECT count(*) FROM sc_no_history WHERE reason='one_off_migration_2026_04';
-- 기대: 849
```

## What Will NOT Be Done

- 비활성(`is_active=false`) 행은 건드리지 않음
- 이미 owner가 일치하는 2,086건은 그대로 (시퀀스 번호도 보존)
- `subcontractor_name` 자체는 변경 없음 (이미 올바른 값으로 가정)
- 이전 `subcontractor_name` 복원은 불가 (덮어써졌음 → `old_subcontractor_name`은 NULL로 기록)
- `defect_change_log`에는 별도 기록 안 함 (SC No 변경은 `sc_no_history`가 전담)

## Risk & Rollback

- 단일 트랜잭션이므로 실패 시 자동 전체 롤백
- 마이그레이션 후 문제가 발견되면 `sc_no_history` 테이블에 old↔new 매핑이 모두 남아있으므로 역마이그레이션 가능 (필요 시 별도 요청)
- 카운터(`subcontractor_issue_counters`)는 새 시퀀스만큼 정상적으로 증가 → 향후 import에 영향 없음

## Files Touched

- 새 마이그레이션 파일 1개 (`supabase/migrations/<timestamp>_reissue_sc_numbers.sql`) — 마이그레이션 도구를 통해 적용
- 코드 변경 없음
