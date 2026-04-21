

## 1번: Anon RLS 정책 제거 + Import 파이프라인 보안 강화

### 제거 대상 Anon 정책 (총 17개)

| 테이블 | 정책명 | 명령 |
|--------|--------|------|
| projects | Anon can read projects | SELECT |
| subtest_change_log | Anon can insert change logs | INSERT |
| subtest_change_log | Anon can read change logs | SELECT |
| subtests | Anon can insert subtests | INSERT |
| subtests | Anon can read subtests | SELECT |
| subtests | Anon can update subtests | UPDATE |
| subtests | DEV anon can delete subtests | DELETE |
| system_alias_map | Anon can read aliases | SELECT |
| system_master | Anon can insert systems | INSERT |
| system_master | Anon can read systems | SELECT |
| upload_batches | Anon can insert uploads | INSERT |
| upload_batches | Anon can read uploads | SELECT |
| upload_batches | Anon can update uploads | UPDATE |
| upload_batches | DEV anon can delete upload batches | DELETE |
| upload_row_logs | Anon can insert upload logs | INSERT |
| upload_row_logs | Anon can read upload logs | SELECT |
| upload_row_logs | DEV anon can delete upload row logs | DELETE |

### 추가할 Authenticated 정책

Anon 정책 제거 시 Import 파이프라인이 깨지지 않도록, 기존에 authenticated 정책이 없는 작업에 대해 새 정책 추가:

| 테이블 | 새 정책 | 조건 |
|--------|---------|------|
| system_master | Authenticated can insert systems | `is_admin_or_superuser(auth.uid())` |
| subcontractor_master | Authenticated can insert subcontractors | `is_admin_or_superuser(auth.uid())` |
| hdec_pic_master | Authenticated can insert hdec pics | `is_admin_or_superuser(auth.uid())` |
| upload_batches | Authenticated can update own uploads | `uploaded_by = auth.uid() OR is_admin_or_superuser(auth.uid())` |

### ImportContext.tsx 수정

Import 시 `upload_batches` INSERT에 `uploaded_by` 필드 누락 -- RLS `uploaded_by = auth.uid()` 정책이 동작하려면 반드시 설정 필요:

```typescript
// processFile 함수 내 upload_batches insert 부분
const { data: { user } } = await supabase.auth.getUser();

await supabase.from('upload_batches').insert({
  ...existing fields,
  uploaded_by: user?.id,  // ← 추가
});
```

### 수정 파일
- `supabase/migrations/` -- DROP POLICY x17, CREATE POLICY x4
- `src/contexts/ImportContext.tsx` -- `uploaded_by` 필드 추가

---

## 2번: Publish Visibility를 Private으로 변경

`publish_settings--update_visibility` 도구로 `private` 설정. 내부 시스템이므로 워크스페이스 멤버만 접근 가능하도록 변경.

---

### 실행 순서
1. DB 마이그레이션: Anon 정책 제거 + Authenticated 정책 추가
2. ImportContext.tsx: `uploaded_by` 설정 추가
3. Publish visibility: private 변경

