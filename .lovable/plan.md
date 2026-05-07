## 전수 백업 시스템 구축 (Full DB + Storage 이중화)

### 사용자 결정사항
- **범위**: 모든 비즈니스 + 인증/권한 메타 (auth.users 비밀번호 해시 제외)
- **저장**: DB(`database_snapshots`)와 Storage(`db-backups` 버킷)에 동일 데이터 이중 저장
- **보존**: 무제한 (자동 삭제 없음)
- **복원**: 전체 교체 (모든 대상 테이블 wipe → insert)

### 1. Storage 버킷 생성 (마이그레이션)
- `db-backups` private 버킷 생성
- `storage.objects` RLS: Admin/Superuser만 SELECT/INSERT/DELETE
- Service role은 Edge Function에서 자동 우회

### 2. `database_snapshots` 컬럼 추가 (마이그레이션)
- `storage_path text` — Storage 객체 경로 (예: `auto/2026-05-07_2350.json.gz`)
- `manifest jsonb` — `{ table_name: row_count }` 요약. 기존 `snapshot_data` jsonb는 호환 유지 (앞으로는 manifest만 채우고 snapshot_data는 NULL 허용)
- `snapshot_data` NOT NULL 제거하고 nullable로 변경

### 3. 복원 도우미 RPC (마이그레이션)
- `public.restore_truncate_all()` SECURITY DEFINER
  - admin/superuser 체크
  - `SET LOCAL session_replication_role = replica` (트리거/FK 비활성)
  - 백업 대상 테이블 순서대로 `TRUNCATE ... CASCADE`
- `public.restore_insert_rows(_table text, _rows jsonb)` SECURITY DEFINER
  - admin/superuser 체크
  - `INSERT INTO {table} SELECT * FROM jsonb_populate_recordset(null::{table}, _rows)`
  - 트리거 비활성 모드에서 호출

### 4. `auto-snapshot` Edge Function 전면 재작성
- service role로 백업 대상 테이블 목록(아래) 순회
- 각 테이블 페이지네이션(1000행)으로 전체 SELECT
- `{ version: 2, generated_at, tables: { name: rows[] } }` JSON 빌드
- `db-backups` 버킷에 `auto/YYYY-MM-DD_HHMM.json` 업로드 (gzip은 Storage가 자동 처리하지 않으므로 plain JSON)
- 동일 데이터(또는 manifest만)를 `database_snapshots` insert
- 매일 SGT 23:50 cron 그대로 사용

### 5. `restore-snapshot` Edge Function 재작성
- admin/superuser 인증
- `snapshot_id` 받아 → `storage_path`로 Storage에서 JSON 다운로드
- `restore_truncate_all()` 호출
- 의존성 순서로 `restore_insert_rows(table, rows)` 반복 호출
- 에러 시 결과 리포트, 부분 성공도 응답

### 6. 수동 백업 트리거 (옵션)
- 기존 Admin UI의 "Manual Snapshot" 버튼이 새 Edge Function `manual-snapshot` 호출하도록 갱신 (또는 `auto-snapshot`에 `mode=manual` 파라미터 추가)

### 7. Admin UI 업데이트
- `database_snapshots` 목록에 storage_path / manifest 표시
- 복원 시 "전체 교체" 경고 다이얼로그 강화 (현재는 subtests만)
- 다운로드 버튼: `db-backups` 버킷 signed URL 발급

---

### 백업 대상 테이블 (의존성 순서: 부모 → 자식)
**1단계 (마스터/설정)**
projects, hdec_eng_master, hdec_pic_master, subcontractor_master, subcontractor_info_master, system_master, system_alias_map, app_settings, field_config, defect_field_config, docs_field_config, custom_field_definitions, defect_classification_rules, defect_classification_alias, defect_subcontractor_workscope, defect_work_types, defect_discipline_fallback, docs_org_alias, import_header_mappings, subcontractor_issue_counters

**2단계 (사용자/권한)**
profiles, user_roles, user_system_permissions

**3단계 (업로드 헤더)**
upload_batches, defect_upload_batches, docs_upload_batches, warranty_upload_batches

**4단계 (코어 비즈니스)**
tests, subtests, defect_items, docs_drawings, docs_omm, docs_spare_part, warranty_items, warranty_threads

**5단계 (자식/이력/감사)**
subtest_comments, subtest_comment_reads, subtest_change_log, schedule_change_audit,
defect_comments, defect_comment_reads, defect_change_log, defect_schedule_change_audit, defect_daily_snapshots, sc_no_history,
docs_change_log, omm_comments,
warranty_comments, warranty_change_log,
upload_row_logs, defect_upload_row_logs, docs_upload_row_logs, warranty_upload_row_logs,
import_field_logs, event_log

**제외**
- `database_snapshots` (자기 자신 — 무한 루프 방지)
- `auth.*` 스키마 (관리 불가)
- `storage.*` 스키마

---

### 기술 메모
- jsonb_populate_recordset로 generated/identity 컬럼 충돌 시: 컬럼 화이트리스트 동적 SELECT로 변경
- 한 백업 파일이 100MB 넘을 경우 대비, Edge Function memory 한계(150MB)에서 테이블별로 순차 스트리밍 고려 (1차 구현은 단일 JSON, 추후 분할 옵션)
- `event_log`/`*_change_log`는 매일 누적되므로 백업 크기 모니터링 필요
- `restore_truncate_all`은 transaction 내에서 `session_replication_role = replica` 적용해야 트리거 비활성 효과
- 보존 무제한이지만 Admin UI에서 수동 삭제 버튼은 제공

---

### 진행 순서 (이 turn에 모두 실행)
1. 마이그레이션 1건: 버킷 + 정책 + 컬럼 추가 + RPC
2. `auto-snapshot/index.ts` 재작성
3. `restore-snapshot/index.ts` 재작성
4. Admin UI 미세 수정 (다음 메시지에서 필요 시)

진행하겠습니다.