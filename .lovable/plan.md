
## 해결 계획: Defect Import History 삭제 시 Bad Request 오류 수정

원인 확인 결과, 현재 삭제 로직은 다음 순서로 동작합니다.

```text
1. defect_items에서 source_upload_id = batch.id 인 defect id 목록 조회
2. 조회된 defect id 전체를 URL query의 in.(...) 조건에 넣어 defect_daily_snapshots 삭제
3. defect_items / audit / row_logs / batch 삭제
```

현재 batch에는 약 1,968건의 defect item이 있고, 이 id 목록을 한 번에 `in.(...)` URL로 보내면서 요청 URL이 과도하게 길어져 `400 Bad Request`가 발생하고 있습니다. 또한 목록 조회도 기본 limit 1,000건 제한에 걸릴 수 있어 대량 import batch 삭제에는 안전하지 않습니다.

## 1. 삭제 로직을 DB 함수 기반으로 변경

클라이언트에서 수천 개 id를 URL에 실어 보내지 않도록, Lovable Cloud database function을 추가하겠습니다.

함수명:

```text
delete_defect_import_batch(_batch_id uuid)
```

동작:

```text
1. 현재 사용자가 admin 또는 superuser인지 서버에서 검증
2. 해당 batch의 defect_items와 연결된 defect_daily_snapshots 삭제
3. defect_schedule_change_audit 삭제
4. defect_upload_row_logs 삭제
5. defect_items 삭제
6. defect_upload_batches 삭제
```

삭제는 database 내부에서 subquery / join으로 처리하므로, URL 길이 제한이나 1,000건 조회 제한에 걸리지 않습니다.

## 2. 보안 적용

함수 내부에서 다음 조건을 먼저 검사합니다.

```text
public.is_admin_or_superuser(auth.uid())
```

admin/superuser가 아니면 삭제를 중단하고 권한 오류를 반환합니다.

현재 UI의 delete button 노출 조건도 유지합니다.

```text
canDelete = isAdminOrSuperuser || import.meta.env.DEV
```

단, 최종 권한 검증은 반드시 서버 함수에서 수행되므로 클라이언트 조작으로 삭제할 수 없습니다.

## 3. 기존 RLS delete policy는 유지

이미 추가된 delete policy는 유지합니다.

```text
defect_upload_row_logs
defect_schedule_change_audit
defect_daily_snapshots
defect_items
defect_upload_batches
```

이번 수정의 핵심은 RLS 문제가 아니라 대량 id를 URL query로 전달하는 방식의 한계이므로, 추가 RLS policy보다는 안전한 서버-side 삭제 함수로 처리합니다.

## 4. `DefectImportLogsPage.tsx` 삭제 로직 수정

현재 코드:

```text
- defect_items id 목록 select
- defect_daily_snapshots.delete().in('defect_id', defectIds)
- 여러 table을 client에서 순차 delete
```

변경 후:

```text
- supabase.rpc('delete_defect_import_batch', { _batch_id: batch.id })
- 성공 시 toast 표시
- selectedBatch 초기화
- Import History 목록 refresh
```

이렇게 하면 T&C Import Log와 동일한 UX는 유지하면서, Defect처럼 대량 row가 있는 import batch도 안정적으로 삭제됩니다.

## 5. 사용자 오류 메시지 개선

삭제 실패 시 현재는 단순히 `Bad Request`만 표시됩니다.

변경 후에는 상황별로 더 명확한 메시지를 표시합니다.

```text
권한 없음:
You do not have permission to delete this import batch.

기타 오류:
Delete failed. Please try again or contact administrator.
```

기술 상세는 console/log에는 남기되, UI에는 사용자가 이해 가능한 메시지를 보여주겠습니다.

## 6. 수정 대상

```text
supabase/migrations/[new_migration].sql
src/pages/DefectImportLogsPage.tsx
```

## 7. 검증 항목

```text
1. Defect Import History에서 대량 row batch 삭제 시 Bad Request가 발생하지 않음
2. 1,000건 초과 defect item이 포함된 batch도 삭제 가능
3. defect_daily_snapshots가 해당 batch defect 기준으로 함께 삭제됨
4. defect_schedule_change_audit가 upload_id 기준으로 삭제됨
5. defect_upload_row_logs가 upload_id 기준으로 삭제됨
6. defect_items가 source_upload_id 기준으로 삭제됨
7. defect_upload_batches row가 최종 삭제됨
8. 삭제 성공 후 Import History 목록이 갱신됨
9. admin/superuser 외 사용자는 서버 함수에서 삭제 거부됨
10. 기존 T&C Import Log UI/동작에는 영향 없음
```
