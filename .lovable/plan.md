## 현황 진단

Warranty Detail 페이지의 **Change History** 카드는 항상 "No changes logged."만 표시됩니다.

### 원인

| 위치 | 동작 |
|---|---|
| `DocsWarrantyDetailPage.tsx` (L153) | `docs_change_log` 테이블을 `sub_module='warranty'` 조건으로 읽음 |
| Detail의 `save()` (L177~) | `warranty_items` UPDATE만 수행, **docs_change_log INSERT 없음** |
| `WarrantyImportContext.tsx` | 임포트 시 **로그를 어디에도 쓰지 않음** (OMM/ABD/Spare는 `docs-import-logging.ts`로 기록) |
| DB | `docs_change_log` 의 `sub_module='warranty'` 행 수 = **0** |
| DB | 별도 테이블 `warranty_change_log` 도 존재하지만 **0행** (어떤 코드도 쓰지 않음) |
| DB 트리거 | `trg_warranty_items_event_log` 가 `event_log` 에는 적재 중 — 단, UI는 event_log를 안 읽음 |

즉 OMM·Spare Part와 동일 패턴을 따랐어야 했는데, Warranty만 양쪽(저장·임포트) 다 누락되어 UI가 항상 빈 상태입니다.

## 수정 계획

OMM Detail (`DocsOMMDetailPage.tsx` L186 패턴)과 동일하게 맞춥니다.

### 1) Detail 단일 필드 저장 시 로그 적재

`src/pages/docs/DocsWarrantyDetailPage.tsx` `save()` 내부에서 update 성공 후:

```ts
await supabase.from('docs_change_log').insert({
  sub_module: 'warranty',
  record_id: id,
  changed_field: field,
  old_value: row[field] != null ? String(row[field]) : null,
  new_value: value != null ? String(value) : null,
  change_source: 'manual',
  changed_by: user?.id ?? null,
});
```
저장 후 `setLogs(...)` 갱신 (또는 reload).

### 2) Import 시 로그 적재

`src/contexts/docs-import/WarrantyImportContext.tsx` 의 upsert 경로에서 inserted/updated 결과를 모아 `docs-import-logging.ts` 의 `logChanges` (혹은 동일 형태)를 호출. `sub_module='warranty'`, `record_id=warranty_items.id`, `change_source='import'`, `upload_id=batchId` 로 적재. OMM/ABD가 사용 중인 헬퍼를 그대로 재사용.

### 3) 기존 변경 이력 백필 (선택)

원하시면 `event_log` (table_name='warranty_items') 의 과거 행을 `docs_change_log` 로 1회 마이그레이션. 미진행 시 적용 시점 이후 변경분만 노출됩니다.

### 4) 사용 안 하는 `warranty_change_log` 테이블 처리

코드/트리거 모두 미사용. 삭제하거나 그대로 둘지 확인 필요 (안전하게는 보존).

## 영향 범위

- 프론트 2개 파일 (Detail save, WarrantyImportContext)
- DB 변경 없음 (백필을 선택할 경우 1회 마이그레이션만)
- 다른 모듈(OMM/ABD/Spare) 동작에는 영향 없음

## 확인 필요

1. **백필**을 진행할까요? (event_log → docs_change_log, sub_module='warranty')
2. `warranty_change_log` 빈 테이블을 **삭제**할까요, 보존할까요?
