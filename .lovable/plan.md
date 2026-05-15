
# Punch Import 풀스택 정렬 — 잔여 작업

이전 단계에서 DB 마이그레이션, `usePunchFieldConfig`, `PunchColumnSelect`, `punch-excel-utils` 변경 로그 연동까지 완료됨. 이번 플랜은 남은 4개 항목을 다른 모듈(T&C, Defect, Docs)과 동일한 수준으로 정렬한다.

## 1. PunchImportLogsPage (신규)

`DefectImportLogsPage.tsx` 패턴을 그대로 차용:
- `punch_upload_batches` 목록 (최신순, 페이지네이션)
- 배치 클릭 시 `punch_upload_row_logs` + `import_field_logs(kind='punch')` 확장 패널
- `FieldLogTable` / `FieldLogSummaryChips` 재사용
- CSV 내보내기 (`buildFieldLevelCsv` 재사용)
- 헤더에 RollbackDialog 액션 (아래 4번과 연결)

파일: `src/pages/PunchImportLogsPage.tsx`

## 2. 사이드바 & 라우팅

- `src/App.tsx`: `/punch/import-logs` 라우트 추가 (`ProtectedRoute` + 권한 가드)
- `src/components/layout/AppSidebar.tsx`: Punch 섹션의 Import 아래에 "Import Logs" 메뉴 추가 (다른 모듈과 동일한 아이콘/순서)

## 3. Admin 통합

- `src/pages/admin/HeaderMappingsTab.tsx`: 모듈 선택 드롭다운에 `'punch'` 옵션 추가 (`useHeaderMappings`는 이미 punch 지원)
- `src/components/admin/UnmappedAliasQueue.tsx`: `punch_upload_batches` 스캔 추가 — 현재 T&C/Defect/Docs를 순회하는 로직에 punch 케이스를 포함시켜 미매핑 헤더 큐가 punch 임포트도 잡도록 함
- `src/pages/AdminPage.tsx` Field Config 탭: Punch 모듈 추가 (Defect Field Config 패턴 그대로, `usePunchFieldConfig` 사용)

## 4. Rollback 연동

DB 측:
- `preview_rollback_punch_import_batch(_batch_id uuid)` RPC — `punch_change_log` + `punch_upload_batches`로 insert/update/conflict 카운트 산출
- `rollback_punch_import_batch(_batch_id uuid, _force boolean)` RPC — soft(변경 필드만 복원, 신규행은 `is_active=false`) / force(이후 변경도 덮어쓰기) 정책
- 두 함수 모두 `SECURITY DEFINER`, `is_admin_or_superuser` 가드, `rolled_back_*` / `rollback_force` / `rollback_reason` 메타 갱신

UI 측:
- `src/components/import/RollbackDialog.tsx`: `RollbackKind`에 `'punch'` 추가, `PREVIEW_FN` / `ROLLBACK_FN` 매핑 확장
- `PunchImportLogsPage` 액션 컬럼에 `<RollbackDialog kind="punch" ... />` 배치

## 기술 메모

- `punch_change_log` 스키마는 이미 마이그레이션에서 생성됨 (`field_name`, `old_value`, `new_value`, `upload_id`, `punch_id`, `changed_at`, `changed_by`)
- D.Super User는 본인 team 행만 롤백 영향 — RPC 내부에서 `user_team_matches` 가드
- Field Config는 `outstanding_work` 시스템 가드 유지 (필수 해제 불가)

## 변경/생성 파일

신규:
- `src/pages/PunchImportLogsPage.tsx`
- `supabase/migrations/<ts>_punch_rollback_rpcs.sql`

수정:
- `src/App.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/import/RollbackDialog.tsx`
- `src/pages/admin/HeaderMappingsTab.tsx`
- `src/components/admin/UnmappedAliasQueue.tsx`
- `src/pages/AdminPage.tsx` (Field Config 탭에 Punch 추가)

## 제외

- Photo OCR (별도 작업)
- 신규 시각 디자인
- punch 데이터 모델 자체 변경
