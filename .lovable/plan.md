# Punch Import 풀스택 정렬 계획

현재 `PunchImportPage`는 MVP 수준으로, 다른 성숙 모듈(T&C / Defect / Docs)에 있는 import 부가 기능들이 누락되어 있습니다. 인프라(테이블·SSOT registry)는 이미 대부분 갖춰져 있어 **컴포넌트 어댑트 + 일부 마이그레이션**으로 따라잡을 수 있습니다.

## 현재 상태 진단

| 영역 | 인프라 | UI/로직 |
|---|---|---|
| Field Registry (SSOT) | ✅ `punch-field-registry.ts` | ✅ |
| Header Mappings DB | ✅ `import_header_mappings` (module='punch' 이미 허용) | ❌ Punch는 미사용 |
| Upload Batches | ✅ `punch_upload_batches` (rollback 컬럼 포함) | ⚠️ 기록만 함, UI 없음 |
| Change Log | ✅ `punch_change_log` | ⚠️ 기록 없음 |
| Field Log | ⚠️ `import_field_logs` 존재하나 `kind` CHECK에 'punch' 누락 | ❌ |
| Column Select Dialog | ✅ 공용 `ColumnSelectDialog` 존재 | ❌ Punch 어댑터 없음 |
| Field Config (필수 필드) | ⚠️ 모듈별 테이블 패턴(defect/docs/field_config) | ❌ Punch 없음 |
| Import Logs Page | ✅ 다른 모듈 존재 | ❌ Punch 없음 |
| Rollback Dialog | ✅ 공용 `RollbackDialog` | ❌ Punch 미연결 |

## 작업 단계

### 1. DB 마이그레이션 (1회)

- `import_field_logs.kind` CHECK에 `'punch'` 추가
- `punch_field_config` 테이블 신설 (`defect_field_config` 동일 스키마: field_name, is_required, is_visible, label_override, sort_order …) + RLS (admin write, authenticated read)
- (선택) `punch_upload_batches`에 `rollback_reason text` 추가 — 다른 모듈과 일관성 위해

### 2. Hooks & Lib

- `src/hooks/usePunchFieldConfig.ts` — `useDefectFieldConfig` 패턴 복제, `PUNCH_FIELDS` 기본값과 머지
- `useHeaderMappings({ module: 'punch' })` 그대로 사용 → `parsePunchWorkbook`이 등록된 alias도 인식하도록 `normalizePunchHeader` 호출 전에 동적 mapping 적용
- `src/lib/punch-excel-utils.ts` 확장:
  - `upsertPunchRows`에 `excludedFields: Set<string>` 옵션 → 해당 필드는 무시
  - upsert 시 변경 감지하여 `punch_change_log`에 diff 기록
  - `import_field_logs`에 행별 outcome 기록 (applied / unchanged / skipped_empty / rejected_invalid …)

### 3. UI 컴포넌트

- `src/components/import/PunchColumnSelect.tsx` 신설 — `DocsColumnSelect` 패턴 그대로 (system_required = `outstanding_work`, field config 기반 추가 필수 가드)
- `PunchImportPage.tsx`:
  - 파일별 "Configure Columns" 버튼 → `PunchColumnSelect` 오픈 → `excludedFields` 상태 저장
  - "Unmapped columns" 옆에 "Add to mapping" 링크 → 관리자면 즉석 alias 등록 모달
- `src/pages/PunchImportLogsPage.tsx` 신설 — `DefectImportLogsPage` 복제, batch 목록 + drill-down (`FieldLogTable` 재사용) + Rollback 버튼(`RollbackDialog`)
- 사이드바(`AppSidebar.tsx`)에 "Punch > Import Logs" 메뉴 항목 추가, 라우터(`App.tsx`)에 `/punch/import-logs` 등록

### 4. Admin 통합

- `src/pages/admin/HeaderMappingsTab.tsx`의 모듈 셀렉트에 `Punch` 추가 (이미 DB CHECK 허용)
- `src/components/admin/UnmappedAliasQueue.tsx`가 punch upload batch도 스캔하도록 module 필터 확장
- Admin > Field Config 탭(존재 시)에 Punch 모듈 추가, 없으면 별도 작은 카드 섹션 추가

### 5. Rollback 로직

- `RollbackDialog`를 punch에 연결: 해당 batch에서 들어온 `punch_items` 행을 식별 (`source_upload_id == batch_id`)
- 옵션:
  - **Soft rollback**: insert된 행만 삭제, update된 행은 `punch_change_log`로 직전 값 복원
  - **Force rollback**: 모든 영향 행 삭제 (다른 모듈과 동일 정책)
- 완료 후 `punch_upload_batches.rolled_back_at/by/force` 갱신

## 변경 파일 요약

신규
- `supabase/migrations/<ts>_punch_import_alignment.sql`
- `src/components/import/PunchColumnSelect.tsx`
- `src/hooks/usePunchFieldConfig.ts`
- `src/pages/PunchImportLogsPage.tsx`

수정
- `src/lib/punch-excel-utils.ts` (excluded fields, change log, field log)
- `src/lib/punch-field-registry.ts` (필요 시 default labels export)
- `src/pages/PunchImportPage.tsx` (Column Select 버튼, header mapping 적용)
- `src/components/import/ColumnSelectDialog.tsx` 호환성 확인 (수정 거의 없음)
- `src/pages/admin/HeaderMappingsTab.tsx` (Punch 옵션)
- `src/components/admin/UnmappedAliasQueue.tsx` (punch 모듈 처리)
- `src/components/layout/AppSidebar.tsx`, `src/App.tsx` (라우트)

## 비범위

- Punch에 Photo OCR (Defect 전용 워크플로우)
- 새로운 시각 디자인 변경 — 기존 디자인 토큰/패턴 그대로 사용
- Punch 자체 데이터 모델 변경 (필드 추가/제거)

## 검증 시나리오

1. Excel 업로드 → "Configure Columns" → Item No 체크 해제 시도 → "system required" 경고
2. 미매핑 헤더 노출 → 관리자가 Admin > Header Mappings에서 등록 → 재파싱 시 매핑됨
3. Import 실행 → `/punch/import-logs`에 batch 표시, 클릭 시 `import_field_logs` 행별 결과
4. Rollback 클릭 → 영향 행수 표시 → 실행 → `punch_items` 원복, batch에 `rolled_back_at` 기록
5. 비관리자는 Rollback / Header Mapping 등록 버튼 비노출
