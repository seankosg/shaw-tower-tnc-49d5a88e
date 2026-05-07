## 목표

기존 `defect_items` 중 `actual_completion_date`는 있으나 `actual_start_date`가 비어 있는 행을 찾아 **`actual_start_date := actual_completion_date`** 로 일회성 백필.

대상 건수: **1,150건** (is_active=true 기준).

---

## 적용 규칙 (이전에 합의된 import 정책과 동일)

- 조건: `actual_completion_date IS NOT NULL AND actual_start_date IS NULL AND is_active = true`
- 값: `actual_start_date = actual_completion_date`
- 변경 출처: `change_source = 'one_time_migration'`, reason `'actual_start_imputed_from_completion'`

---

## 실행 단계 (insert 도구로 일괄 실행, 단일 트랜잭션)

1. **defect_change_log 기록**: 대상 행마다 `changed_field='actual_start_date'`, `old_value=NULL`, `new_value=actual_completion_date`, `change_source='one_time_migration'`, `changed_by=NULL` (시스템).
2. **defect_items UPDATE**: `actual_start_date = actual_completion_date`, `updated_at = now()` (트리거가 row_version 증가).
3. **defect_schedule_change_audit 에는 기록하지 않음** — 합의된 정책(c) "스케줄 revision에서 제외"와 일관.

---

## 검증 (실행 후)

- `SELECT COUNT(*) FROM defect_items WHERE actual_completion_date IS NOT NULL AND actual_start_date IS NULL AND is_active = true;` → 0
- `SELECT COUNT(*) FROM defect_change_log WHERE change_source='one_time_migration' AND changed_field='actual_start_date';` → 1150
- 샘플 5건 spot-check.

---

## 범위 외

- 비활성(`is_active=false`) 행 제외.
- T&C / Docs 모듈은 해당 없음.
- Schedule revision audit 미기록.
- 롤백이 필요하면 `defect_change_log` 기준으로 역적용 가능 (별도 요청 시).
