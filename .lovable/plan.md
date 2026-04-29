## SC No Counter Drift 영구 차단 (옵션 2)

### 배경
이번 import 실패의 직접 원인은 `subcontractor_issue_counters.next_seq`(KURIHARA=115)가 실제 사용 중인 최대 시퀀스(122)보다 작아서, RPC `allot_subcontractor_issue_no`가 이미 존재하는 `SC-KURIHARA-115` 등을 다시 발급하다가 unique index `defect_items_subcontractor_issue_unique`에 걸린 것. 2026-04-28에 한 번 동기화 마이그레이션을 돌렸지만, 이후 또 어긋남. 매번 수동 정정은 한계가 있으므로 영구 차단 장치를 넣는다.

### 변경 1 — DB 마이그레이션 (신규 파일)

**`supabase/migrations/<timestamp>_sync_sc_counters_rpc.sql`**

1. **새 RPC `public.sync_all_subcontractor_counters(_project_id uuid)`** 생성
   - 해당 project의 모든 활성 defect_items에서 owner별 max(seq) 산출
   - `subcontractor_issue_counters.next_seq`를 `GREATEST(현재값, max_used+1)`로 upsert
   - SECURITY DEFINER, search_path=public, authenticated에 EXECUTE 권한
   - 멱등성 보장 — 이미 카운터가 충분히 크면 no-op
   - 반환: owner_code별 변경 내역 (디버깅용)

2. **즉시 1회 실행** — DO 블록으로 모든 활성 project에 대해 호출 → KURIHARA를 비롯한 현재 drift를 그 자리에서 모두 정정.

```sql
CREATE OR REPLACE FUNCTION public.sync_all_subcontractor_counters(_project_id uuid)
RETURNS TABLE(owner_code text, new_next_seq int) ...
-- (regex로 SC-OWNER-NNNNN 파싱 후 GREATEST upsert)

DO $$ ... PERFORM ... FOR each active project ... $$;
```

### 변경 2 — Client 코드

**`src/contexts/DefectImportContext.tsx`** (line 550 직전)

`buildSubcontractorIssueAssignments` 호출 직전에 sync RPC를 한 번 호출한다. 실패해도 import는 계속 진행(방어용 try/catch + console.warn). 이로써 카운터가 어떤 경로로 어긋나도 import 시작 시점에 self-heal.

```ts
try {
  await supabase.rpc('sync_all_subcontractor_counters', { _project_id: activeProjectId });
} catch (err) {
  console.warn('sync_all_subcontractor_counters failed (continuing):', err);
}
const assignments = await buildSubcontractorIssueAssignments(...);
```

### 변경 없음
- `defect_items` 스키마 / 기존 발번 RPC / unique index — 그대로
- 다른 import/page 영향 없음 (사용자 정정 정책 유지)

### 확인 단계
1. 마이그레이션 적용 후 `subcontractor_issue_counters` 조회 → KURIHARA next_seq ≥ 123 확인
2. 사용자에게 실패한 엑셀 재업로드 요청 → 정상 import (208행 모두 신규 INSERT) 확인
3. 콘솔에 sync_all_subcontractor_counters 호출이 보이는지 네트워크 로그로 확인

### 향후 효과
- 수동 SC No 입력, owner 재할당, 백필 마이그레이션 등 어떤 경로로 카운터가 뒤처지더라도 다음 import 시작 시점에 자동으로 따라잡힘
- 재발 시 별도 마이그레이션 필요 없음
