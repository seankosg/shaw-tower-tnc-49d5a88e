## Spare Part 데이터 전체 삭제 (일회성 마이그레이션)

신규 import를 위해 `docs_spare_part` 관련 모든 기존 데이터를 완전 삭제합니다. (soft delete 아님, 물리적 DELETE)

### 삭제 대상

| 테이블 | 조건 | 건수 |
|---|---|---|
| `import_field_logs` | spare_part 배치 소속 | 2,628 |
| `docs_change_log` | `sub_module='spare_part'` | 2,628 |
| `docs_upload_row_logs` | spare_part 배치 소속 | 282 |
| `docs_spare_part` | 전체 | 282 |
| `docs_upload_batches` | `sub_module='spare_part'` | 2 |

### 마이그레이션 SQL

```sql
DELETE FROM public.import_field_logs
 WHERE upload_id IN (SELECT id FROM public.docs_upload_batches WHERE sub_module='spare_part');

DELETE FROM public.docs_change_log WHERE sub_module='spare_part';

DELETE FROM public.docs_upload_row_logs
 WHERE upload_id IN (SELECT id FROM public.docs_upload_batches WHERE sub_module='spare_part');

DELETE FROM public.docs_spare_part;

DELETE FROM public.docs_upload_batches WHERE sub_module='spare_part';
```

### 주의

- **복구 불가** — 백업 스냅샷 외에는 되돌릴 수 없습니다.
- 다른 모듈(ABD, OMM, Warranty) 데이터는 영향 없음.
- 코드 변경 없음.

승인하시면 마이그레이션을 실행합니다.