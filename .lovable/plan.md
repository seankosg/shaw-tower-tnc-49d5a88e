
# Docs Import 허브 통합 (Phase 1: ABD + OMM)

Warranty / Spare Part 는 본 단계에서 제외 → 별도 페이즈에서 진행.

## 현황

| Sub-module | Raw Data | Import 페이지 | row_logs | field_logs | change_log |
|---|---|---|---|---|---|
| ABD | `/docs/abd` (풀기능) | `/docs/import` (풀기능) | 기록 | 기록 | 기록 |
| OMM | `/docs/omm` (풀패리티) | `/docs/omm/import` (자체 state) | **미기록** | **미기록** | **미기록** |

공통 인프라는 이미 4개 sub-module 지원 — 활용만 하면 됨:
- `docs_upload_batches.sub_module` (`as_built|omm|warranty|spare_part`)
- `docs_upload_row_logs(upload_id, raw_row_no, document_no, action_taken, reason_code, reason_detail)` — `document_no` 컬럼은 sub-module 키 공용 슬롯으로 사용 (화면 라벨만 동적)
- `docs_change_log(sub_module, record_id, drawing_id, …)` — `record_id` 가 범용 키, `drawing_id` 는 ABD 전용 레거시
- `import_field_logs(kind='docs', row_log_id, field_name, outcome, raw_value, applied_value, previous_value)`
- `DocsImportLogsPage` — batch 단위로 sub_module 표시 가능

문제점:
1. **`delete_docs_import_batch` RPC가 `docs_drawings`만 unlink** — OMM batch 삭제 시 `docs_omm.source_upload_id` 가 끊기지 않음.
2. **OMM은 row/field/change log를 전혀 안 남김** — 감사 추적 단절, Logs 페이지에서 OMM batch가 빈 row만 노출.
3. **Import 페이지가 sub-module별로 따로 존재** — OMM은 `/docs/omm/import` 자체 state, ABD는 `/docs/import` Context. 패턴 불일치.

## 목표

ABD 운영 품질 (헤더 자동 매핑, alias 매칭, batch + row_log + field_log + change_log, 풍부한 에러 UI, data date) 을 **단일 Import Hub `/docs/import`**에서 ABD/OMM 모두에 동일하게 제공. OMM 전용 페이지는 깔끔히 삭제.

## 1. 정보 구조

`/docs/import` 을 **2개 탭 허브**로 변경 (이후 Warranty / Spare Part 추가될 자리 미리 마련):
- 탭: **ABD** · **OMM** (Warranty / Spare Part 는 disabled placeholder, "Coming soon" 안내)
- URL: `/docs/import?sub=abd|omm`
- 한쪽 탭이 import 진행 중이면 다른 탭의 Start 버튼 disable
- `View Import Logs` 버튼은 `/docs/import/logs?sub=…` 로 sub_module 필터 미리 적용

`/docs/omm/import` 라우트 → `/docs/import?sub=omm` 으로 **즉시 redirect 후 라우트 제거**.

`/docs/import/logs`:
- 상단에 sub_module 필터 (ALL / ABD / OMM / Warranty / Spare Part) 추가 — `docs_upload_batches.sub_module` 으로 필터링
- batch detail 의 row log 컬럼 헤더는 sub_module 따라 라벨 변경 (ABD: `Document No`, OMM: `SN`)
- field log / 삭제 / CSV 내보내기는 그대로 사용 (kind='docs')

## 2. 공용 셸 (`DocsImportShell`)

ABD `DocsImportPage` UI 를 일반화 — 변하는 부분만 prop:

```text
DocsImportShell (props: subModule, useImporter, keyFieldLabel, rawDataPath, dataDateRequired)
 ├─ Header (제목 / 설명 / View Logs)
 ├─ Module-paused banner
 ├─ Drop zone + file picker
 ├─ Files list
 │    ├─ status, parsed count, data date
 │    ├─ error code / details / hint
 │    ├─ unmapped headers (+ Admin → Header Mappings 링크)
 │    ├─ empty key count, in-file dup count, reject samples
 │    └─ result badges (inserted/updated/skipped/rejected)
 └─ Summary card (inserted/updated/skipped/rejected/unmatched + OMM resubmission 안내)
```

## 3. 공용 Importer Factory

기존 `DocsImportContext` (ABD 전용) 를 factory 로 일반화:

```ts
createDocsImportProvider({
  subModule,        // 'as_built' | 'omm'
  parseFile,        // (File, sheets?) => ParseResult
  getSheetNames,    // (File) => string[]
  upsertWorker,     // sub-module 별 업서트 핵심
  keyField,         // 'document_no' | 'sn'
})
```

Provider 2개 (`AbdImportProvider`, `OmmImportProvider`) → `DocsImportProviders` 로 묶어서 트리 마운트. Hook 시그니처 동일.

## 4. 공통 로그 기록 (가장 중요)

ABD/OMM worker 모두 **반드시 동일한 4종 로그를 남김**. 공통 헬퍼 `writeImportLogs(ctx, perRowResults)` 로 일반화 — worker 는 결과 객체만 푸시.

### 4.1 `docs_upload_batches`
- `sub_module` 정확히 채움
- `total_rows / processed_rows / success_rows / skipped_rows / rejected_rows` 카운터 일관 적용
- `data_date` 기록

### 4.2 `docs_upload_row_logs`
- 매 행 처리 결과 1건 기록
- `action_taken`: `inserted | updated | skipped | rejected`
- `document_no` 컬럼에 sub-module 키 값 저장 (ABD=Document No, OMM=SN). DB 컬럼명은 레거시지만 화면 라벨만 sub-module 별 표시.
- `reason_code` / `reason_detail`: 빈 키, in-file 중복, 헤더 검증 실패, DB 에러 등

### 4.3 `import_field_logs` (`kind='docs'`)
- 각 sub-module TRACKED_FIELDS 정의 → `classifyChange` 로 outcome 분류
  - **ABD**: 기존 그대로 유지
  - **OMM**: 카테고리, section, work_trade_material, team, trade, subcontractor_id/name, hdec_pic_name, hdec_eng_name, 수량 4종 (pdf/hardcopy required/actual), 일자 8종 (draft planned/actual/response_planned/response_actual + final 동일), response_status 2종 (draft/final), remarks
- `row_log_id` 로 `docs_upload_row_logs` 와 조인

### 4.4 `docs_change_log`
- `sub_module` + `record_id` 로 ABD/OMM 통합 기록
- `drawing_id` 는 ABD 만 추가 채움 (호환), OMM 은 NULL
- 변경된 필드만 1건씩 INSERT (`changed_field`, `old_value`, `new_value`, `change_source='excel_import'`, `upload_id`, `changed_by`)

## 5. ABD (회귀 방지)

기존 `DocsImportContext` 로직을 `createDocsImportProvider` 로 그대로 이전. 키: `(project_id, sub_module='as_built', document_no)`. 동작 변화 없음 (UI / 카운터 / 에러 메시지 동일).

## 6. OMM 강화

- 파서: 기존 `parseOmmExcel` 재활용
- Worker: `(project_id, sn)` upsert
- **신규 적용 항목**:
  - org alias 매칭 (ABD `buildOrgResolver` 패턴 → `subcontractor_name → subcontractor_id` 자동 매칭)
  - row_log / field_log / change_log 전체 기록 (§4)
  - `rejected / unmatchedOrgs / emptyKeyCount / duplicateKeyCount / rejectSamples` 카운터 표시
  - 헤더 자동 매핑 (`import_header_mappings` module='docs', sub_module='omm') — Admin UI 이미 지원
  - Unmapped headers 패널 + Admin 이동 버튼
- **OMM Resubmission 트리거**: 기존 `docs_omm_after_update_resubmit` 트리거 **그대로 ON 유지**. Import 시점 `draft_response_status` / `final_response_status` 가 B/C 로 바뀌는 row 가 있으면 자동으로 `create_omm_resubmission()` 발화.
  - Summary card 에 `Auto-created N resubmission row(s) (Draft: X, Final: Y)` 메시지 표기 — import 후 `parent_id` + `source_upload_id IS NULL` + `is_resubmission=true` 조건으로 새로 생성된 row 카운트해서 노출.
  - "Resubmission rows are auto-created when response status becomes B or C" 인포 배너로 사용자 사전 안내.

## 7. RPC 업데이트 — `delete_docs_import_batch`

현재 `docs_drawings` 만 unlink. **OMM 도 unlink 하도록 수정** (Warranty / Spare Part 는 다음 페이즈에서 추가):

```sql
UPDATE docs_drawings SET source_upload_id = NULL WHERE source_upload_id = _batch_id;
UPDATE docs_omm      SET source_upload_id = NULL WHERE source_upload_id = _batch_id;
```

Return JSON 에 `omm_unlinked` 추가. 마이그레이션으로 함수 교체. (Phase 2 에서 `rollback_docs_import_batch` 별도 도입 검토 — 본 작업 범위 외.)

OMM resubmission 으로 자동 생성된 child row (`is_resubmission=true`, `parent_id IS NOT NULL`) 는 `source_upload_id` 가 어차피 NULL 이므로 unlink 영향 없음. Batch 삭제해도 child 유지.

## 8. UI 디테일

- 파일 패널 라벨: ABD `Empty Document No` / OMM `Empty SN`
- Unmapped headers 패널 + Admin → Header Mappings 이동 버튼 (공통)
- Reject samples `{rawRowNo, key, reasonDetail}` 동일 포맷
- 탭 라벨 mini 배지 (진행/완료/실패 카운트)
- Logs 페이지 batch 행에 sub_module 배지 (ABD=blue, OMM=purple)

## 9. 권한 / 모듈 일시중지

- `useModuleStatus().docs.enabled` 체크 허브 레벨 1회
- subcontractor 역할은 모든 import 거부 (ABD 패턴 유지)

## 10. 파일 변경 요약

**DB 마이그레이션** (1건)
1. `delete_docs_import_batch` RPC 를 ABD + OMM 처리로 교체

**신규**
- `src/contexts/docs-import/createDocsImportProvider.ts`
- `src/contexts/docs-import/AbdImportContext.tsx`
- `src/contexts/docs-import/OmmImportContext.tsx`
- `src/contexts/docs-import/DocsImportProviders.tsx`
- `src/components/docs/import/DocsImportShell.tsx`
- `src/components/docs/import/DocsImportTabs.tsx`
- `src/lib/docs-import-workers.ts` (ABD + OMM worker)
- `src/lib/docs-import-logging.ts` (`writeImportLogs` 공통 헬퍼)

**수정**
- `src/pages/docs/DocsImportPage.tsx` → 허브 (탭 컨테이너) 재작성
- `src/pages/docs/DocsImportLogsPage.tsx` → sub_module 탭 필터 + 키 라벨 동적
- `src/pages/docs/DocsOMMRawDataPage.tsx` → "Import" 버튼 링크 `/docs/import?sub=omm`
- `src/App.tsx` → `/docs/omm/import` 를 `/docs/import?sub=omm` 으로 redirect, `DocsImportProviders` 마운트
- `src/components/layout/AppSidebar.tsx` → Docs 그룹 활성 매칭 보강

**삭제**
- `src/pages/docs/DocsOMMImportPage.tsx`
- `src/contexts/DocsImportContext.tsx` (새 `docs-import/` 폴더로 대체)

**미변경**
- `docs_omm`, `docs_drawings` 스키마
- ABD / OMM 파서
- HeaderMappings Admin UI
- OMM Raw Data 페이지 본체
- `docs_upload_batches`, `docs_upload_row_logs`, `docs_change_log`, `import_field_logs` 스키마
- `docs_omm_after_update_resubmit` 트리거 (ON 유지 확정)

## 11. 결정 확정

- ✅ Warranty / Spare Part 다음 단계로 분리
- ✅ OMM Resubmission 트리거 import 시 ON 유지 + summary 안내
- ✅ `/docs/omm/import` 즉시 redirect 후 라우트 제거 (별도 호환 기간 없음)

승인 후 (DB 마이그레이션 → factory + 로깅 헬퍼 → ABD/OMM worker → 허브 페이지 → Logs 페이지 탭 → 레거시 삭제) 순으로 구현합니다.
