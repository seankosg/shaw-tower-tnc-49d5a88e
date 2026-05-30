# 백업 완전성 보강 계획 (나 + 다)

현재 백업은 public 스키마 row 데이터만 다루므로, **재해 복구 시 로그인 불가 + 첨부 파일 손실**이 발생합니다. 본 계획은 이 두 빈틈을 메우고, 백업/복원 결과의 정확성을 자동 검증하는 무결성 체크(E)를 추가합니다.

---

## 1. auth.users 백업/복원 (나-1)

### 백업 (auto-snapshot 확장)
- `supabase.auth.admin.listUsers({ page, perPage: 1000 })`로 전체 사용자 페이지네이션 수집
- 보존 필드: `id, email, phone, email_confirmed_at, phone_confirmed_at, created_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data, banned_until, is_sso_user`
- **암호 해시(`encrypted_password`)는 Admin API로 노출 불가** → 별도 security definer RPC `dump_auth_users_with_hash()` (service_role 전용)로 `auth.users`에서 직접 조회해 해시 포함
- 결과를 `{folder}/__auth_users.json`으로 저장, manifest에 `__auth_users: {rows, parts}` 기록

### 복원 (restore-snapshot 확장)
- 기존 사용자와 백업 사용자의 `id` 비교
  - **존재하지 않는 ID**: `auth.admin.createUser()` + 이후 RPC `restore_auth_user_hash(_id, _hash)`로 비밀번호 해시 강제 주입
  - **존재하는 ID**: `email/phone/메타데이터/해시` 갱신(옵션 플래그 `overwrite_existing_users`, 기본 false → 메타데이터만 머지)
  - **백업에 없는 현재 ID**: 기본 보존(옵션 `delete_missing_users`로 강제 삭제 선택 가능, 기본 false)
- profiles/user_roles의 `user_id` FK 무결성이 자동 회복

### 보안
- `dump_auth_users_with_hash()` / `restore_auth_user_hash()` 는 `SECURITY DEFINER`, `REVOKE ALL FROM public`, edge function service_role만 호출
- 백업 JSON에 해시가 포함되므로 Storage `db-backups` 버킷이 **비공개**인지 확인(현재 비공개 가정)

---

## 2. Storage 객체 백업 (나-2)

### 대상 버킷 선정
- 기존 버킷 목록을 `storage.buckets`에서 조회 후, 시스템 버킷(`db-backups`) 제외한 전부 백업
- 주요 후보: 결함 사진, OCR 이미지, PPT 첨부 등

### 백업 방식 (auto-snapshot 내 신규 단계)
- 각 버킷에 대해 `storage.from(b).list()` 재귀 순회 → 파일 경로 리스트 확보
- **본문 복사**: `storage.from(b).download()` → `storage.from('db-backups').upload('{folder}/__storage/{bucket}/{path}')`
  - 동일 SHA256·크기인 경우 직전 백업 폴더에서 **copy(서버 사이드)** 로 재사용해 트래픽/시간 절감
- 메타 인덱스 파일 `{folder}/__storage_manifest.json` 작성: `[{bucket, path, size, etag, mimetype}, ...]`
- 자가 트리거(self-trigger) 루프에 "buckets 단계" 추가(테이블 백업 완료 후 단계 진입)

### 복원 (restore-snapshot 확장)
- `__storage_manifest.json` 읽기 → 각 버킷 비우기(옵션) → `db-backups`에서 원본 버킷으로 객체 복사
- 너무 큰 버킷은 시간 초과 가능 → 단일 호출에서 N개씩 처리하고 self-trigger로 이어 받기
- 옵션 `skip_storage_restore: true`로 분리 실행 가능

### 제한 명시
- 매우 큰 버킷(수십 GB)은 edge function 6분 한도로 분할 다중 호출 필요 → UI에 진행률 표시

---

## 3. 무결성 검증 E (다)

### 백업 직후 자동 검증
- `auto-snapshot` 종료 단계에 `verify_backup(snapshot_id)` 추가:
  - 각 테이블: manifest 행 수 vs `count(*)` 실제 행 수 비교 (백업 시점 이후 신규 행은 별도 카운트로 표시)
  - 각 part 파일 다운로드 1줄 샘플 파싱 OK 여부
  - storage 매니페스트 파일 1% 샘플의 `head()`로 존재 확인
- 결과를 `backup_run_log.integrity_report` JSONB에 저장 (`{tables_ok, tables_mismatch:[{t, manifest, actual}], storage_sampled, storage_missing:[...], auth_users_count_ok}`)
- mismatch 1건 이상이면 `status = 'success_with_warnings'`

### 복원 직후 자동 검증
- `restore-snapshot` 종료 단계에 동일 로직:
  - 복원된 테이블 행 수 vs 매니페스트 행 수
  - storage 복원 시 객체 개수 비교
  - auth.users 개수/주요 ID 표본 비교
- 결과를 기존 `restore_run_log.integrity_report` 신규 컬럼에 저장

### Admin UI
- Backup/Restore 상세 다이얼로그에 "Integrity" 탭 추가 → 카운트 비교 테이블 + 누락 항목 리스트

---

## 4. 마이그레이션 / 스키마 변경

```sql
-- 1) 해시 덤프/복원 RPC (service_role 전용)
CREATE FUNCTION public.dump_auth_users_with_hash() RETURNS SETOF jsonb ...
CREATE FUNCTION public.restore_auth_user_hash(_id uuid, _hash text) RETURNS void ...
REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ... TO service_role;

-- 2) 로그 컬럼 추가
ALTER TABLE backup_run_log
  ADD COLUMN integrity_report jsonb,
  ADD COLUMN storage_backed_up_bytes bigint,
  ADD COLUMN auth_users_backed_up int;

ALTER TABLE restore_run_log
  ADD COLUMN integrity_report jsonb,
  ADD COLUMN restored_auth_users int,
  ADD COLUMN restored_storage_objects int;
```

---

## 5. 작업 순서

1. **DB 마이그레이션**: 위 RPC + 컬럼 추가
2. **auto-snapshot**: auth.users 덤프 단계 + storage 백업 단계 + 무결성 검증 단계 추가
3. **restore-snapshot**: auth.users 복원 + storage 복원 + 무결성 검증 추가, 새 옵션 플래그 노출
4. **Admin UI**: Backup/Restore 상세에 Integrity 탭, "auth users" / "storage objects" 카운트 컬럼 추가
5. **수동 테스트**: 백업 1회 → 무결성 리포트 확인 → 테스트 사용자 1명 추가/파일 1개 업로드 후 복원 → 원상 복귀 확인

---

## 6. 확인 사항

- 진행해도 되는지, 아니면 **(나)만 먼저 / (다)만 먼저** 분리해서 진행할지?
- `auth.users` 비밀번호 해시를 백업 JSON에 포함하는 데 동의(보안상 권장: 동의)?
- Storage 백업 시 어떤 버킷까지 포함할지(전체 vs 특정 버킷 화이트리스트)?
