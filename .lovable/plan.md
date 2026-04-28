# Import Log 사유 누락 보강 (Defect + T&C)

## 문제 요약

현재 `defect_upload_row_logs` / `upload_row_logs` 테이블의 `reason_code`, `reason_detail`이 일부 경로에서 비어 있거나 부정확합니다. Import Logs 화면에서 Skip/Reject된 행의 이유를 사용자가 정확히 알 수 없습니다.

식별된 누락/부정확 케이스는 아래와 같습니다.

---

## 누락 케이스 — Defect Import (`src/contexts/DefectImportContext.tsx`)

### 1. Skipped (no changes) 시 사유 비어 있음 — line 890
```ts
pendingLogs.push({ ..., action_taken: 'skipped', ...logReason });
```
`logReason`은 team이 unresolved일 때만 채워짐. 일반적인 "변경사항 없음" Skip은 `reason_code`/`reason_detail`이 둘 다 비어 있어 로그에 `—`로 표시됨.

→ 항상 `reason_code: 'no_changes'`, `reason_detail: 'All importable fields match existing values; no update needed.'`을 기본으로 넣고, team unresolved 시 detail에 추가 정보를 append.

### 2. DB INSERT/UPDATE 실패 — lines 619, 633 (flushUpdates / flushInserts)
현재 DB 오류 발생 시 `throw new Error(...)`로 전체 batch를 중단할 뿐, 해당 행에 대한 row-log를 남기지 않음. T&C 쪽의 `reason_code: 'update_failed' / 'insert_failed'` 패턴이 Defect에는 없음.

→ flush 시점에 실패 시 chunk 내 각 행에 대해 `defect_upload_row_logs`에 `action_taken: 'rejected'`, `reason_code: 'db_update_failed'`/`'db_insert_failed'`, `reason_detail: <Postgres error message>`를 즉시 기록한 뒤 throw.

### 3. Duplicate subcontractor_issue_no — line 793
detail이 "X already exists in this project."뿐. 어떤 기존 defect와 충돌인지 알 수 없음.

→ `existingByIssueNo` / issueRegistry를 활용해 충돌 상대 issue_no를 detail에 포함: `"<value> already assigned to issue_no=<other>".`

### 4. Re-import not found — line 780
`id=n/a`라는 표기가 사용자에게 모호함.

→ "id 없음" / "id provided but no row matches" / "issue_no not found in DB" 케이스를 분리해 detail에 명확히 기재.

### 5. 자동 보정(reconcile) 시 사유 — lines 826, 836, 840, 845
이미 일부 기록되지만 `action_taken`이 항상 `'updated'`/`'inserted'`로 들어가, 같은 행에 대해 여러 reason 로그가 쌓일 수 있음. (현재 동작 유지하되) detail prefix로 어떤 자동 보정인지 명확히 함.

→ 코드 변경 없음. (의도된 다중 로그 동작 유지)

### 6. 파서 단계에서 누락된 행
`defect-parser`에서 row가 drop되는 경로(헤더 부재 등)는 row-log로 남지 않음. 사용자가 "엑셀 N행이 왜 import 안 됐는지" 알 수 없음.

→ 파서가 drop한 행도 caller에 `{ rawRowNo, reason }` 형태로 반환하도록 하고, importOneFile 시작부에 `action_taken: 'rejected'`, `reason_code: 'parser_dropped'`, `reason_detail`로 일괄 기록.
(파서 동작이 복잡하므로 1차로는 "파싱된 행 수 < 원본 행 수"인 경우 batch 단위 메모로 남기고, 세부 행 추적은 후속 작업으로 분리.)

---

## 누락 케이스 — T&C Import (`src/contexts/ImportContext.tsx`)

### 1. Skipped (no changes) 시 detail 비어 있음 — line 356
```ts
{ ..., action_taken: 'skipped', reason_code: 'no_changes', mapped_system_id: systemId }
```
`reason_detail`이 없음.

→ `reason_detail: 'All mapped columns match existing values; no update needed.'` 추가.

### 2. update_failed / insert_failed — lines 442, 549
이미 `error.message`를 detail에 넣지만, Postgres 에러 코드(P0001 등)와 컬럼명이 메시지에 포함되지 않는 경우가 있음.

→ detail을 `${error.code ?? ''}: ${error.message} (details: ${error.details ?? '—'}, hint: ${error.hint ?? '—'})` 형태로 풍부하게.

### 3. resolveSystem 자동 등록 실패 — line 281
현재 system 자동 INSERT가 실패하면 `null` 반환 → line 297에서 `system_resolve_failed`로 기록되지만 detail에 "auto-register failed: <error>"가 포함되지 않음.

→ resolveSystem이 실패 사유 문자열도 함께 반환하도록 하여 reason_detail에 합침.

---

## 변경 파일

- `src/contexts/DefectImportContext.tsx` — 항목 1~5 (no-changes 사유, db 실패 per-row 로그, duplicate detail 강화, reimport detail 분기)
- `src/contexts/ImportContext.tsx` — T&C 1~3 (no-changes detail, db 실패 detail 강화, system resolve 사유)

## 비변경 항목

- `defect_upload_row_logs` / `upload_row_logs` 테이블 스키마는 이미 `reason_code` + `reason_detail` 두 컬럼을 보유 → 마이그레이션 불필요.
- Import Logs UI(`DefectImportLogsPage.tsx`, `ImportLogsPage.tsx`)는 이미 두 컬럼을 표시 → UI 변경 불필요.
- 파서 단계 행 누락 추적(Defect 항목 6)은 범위가 커서 본 작업에서는 batch 단위 차이만 토스트로 안내하고, 행 단위 추적은 별도 작업으로 분리.

## 기대 결과

Import Logs에서 모든 Skip / Reject 행이 `reason_code`와 `reason_detail` 두 컬럼에 사유를 명확히 표시. DB 실패 시에도 어떤 행에서 어떤 Postgres 에러가 났는지 행 단위로 확인 가능.
