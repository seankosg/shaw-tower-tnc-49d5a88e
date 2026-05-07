## 목표

Defect raw data import 시, **Excel 원본 또는 기존 DB에 `actual_completion_date`가 명시적으로 있는** 행에 한해, `actual_start_date`가 비어 있으면 동일값으로 자동 보정.

(T&C subtests는 스키마상 해당 없음 → 변경 없음)

---

## 적용 규칙

다음 **모두** 충족 시에만 보정:

1. Excel 원본(`row.actual_completion_date`) 또는 기존 DB(`existing.actual_completion_date`)에 completion이 존재.
2. `reconcileClosureCompletion`이 임의로 채운 completion(Status="Work Done"/"Closed" 자동 보정값)은 **제외**.
3. Excel과 기존 DB 모두 `actual_start_date`가 비어 있음.

만족 시:
- `row.actual_start_date := <위 1번의 명시적 actual_completion_date>`
- `import_field_logs`에 `auto_filled` + `reason_code='actual_start_imputed_from_completion'` 기록.
- `schedule_revisions` 자동 생성에서 이 보정 1건은 **제외** (혹은 trigger가 actual_start_date 변경을 감지하지 않도록 우회).

---

## 변경 파일

### `src/contexts/DefectImportContext.tsx`

- `excelExplicit` 직후, blank-preservation 이후에 신규 보정 블록 추가:
  - `excelHasCompletion = !!(원본 row.actual_completion_date)` 캡처(blank-preservation 이전 값 사용 — 이미 `excelExplicit.actual_completion_date`로 캡처되어 있으므로 그대로 활용).
  - `dbHasCompletion = !!existing?.actual_completion_date`.
  - `excelHasStart = !!(원본 row.actual_start_date)` (캡처 추가 필요 — 새 변수).
  - `dbHasStart = !!existing?.actual_start_date`.
  - 조건 충족 시 `row.actual_start_date = excelExplicit.actual_completion_date ?? existing.actual_completion_date`.
  - field log push: `fl(rawRowNo, 'actual_start_date', 'auto_filled', { applied, code: 'actual_start_imputed_from_completion', detail: 'Imputed from actual_completion_date' })`.
  - `pendingLogs.push({ ..., action_taken: existing ? 'updated' : 'inserted', reason_code: 'actual_start_imputed_from_completion', reason_detail: ... })`.

- 보정은 `reconcileClosureCompletion` **이전**에 수행하되, completion 출처는 항상 "Excel-explicit 또는 DB 기존값"만 사용 → reconcile이 만든 completion에는 영향받지 않음.

### `src/lib/import-field-log.ts`

- `auto_filled` 코드는 이미 사용 중인지 확인 후 없으면 추가. 새 reason_code 문자열 등록.

### Schedule revision 제외 처리

- `src/lib/schedule-change-utils.ts`(또는 import 시 `buildScheduleChangeImpact` 호출부)에서 actual_start_date 변경분 중 "이번 import에서 imputed 표시된 행"은 revision에서 제외.
- 가장 단순한 구현: 보정한 행의 set에 id를 모아두고 revision 생성 직전에 actual_start 항목만 제외. 기존 revision 트리거 로직을 최소 침해.

---

## 검증 (구현 후)

- 단위 테스트(추가):
  - completion 있고 start 없음 → 보정 적용, log 기록.
  - completion 없음 → 보정 미적용.
  - reconcile이 채운 completion만 있고 Excel/DB 모두 completion 없음 → 보정 미적용.
  - start 이미 존재 → 보정 미적용.
- 수동 테스트: 샘플 Excel 1개로 raw data와 import logs, schedule revisions 화면에서 의도대로 동작 확인.
- 빌드 통과 확인.

---

## 범위 외

- T&C subtests 변경 없음.
- DB schema 변경 없음 (마이그레이션 불필요).
- Quick Update / Detail / Bulk Edit 화면의 사용자 입력 흐름은 변경 없음.
- Memory 업데이트(business-rules)는 구현 후 별도 반영.
