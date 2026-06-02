# 백업/복원 완전성 강화 계획 (옵션 2: A+B+C)

## 목표
현재 백업 시스템에 다음 3가지를 추가해 **새 프로젝트로의 완전 재해 복구**를 가능하게 만든다.

- (A) DB 스키마 덤프 — 테이블/인덱스/제약/함수/트리거 정의
- (B) `auth.identities` 백업 — 소셜 로그인 연결 보존
- (C) 단일 시점 일관성 — 모든 테이블을 같은 트랜잭션 스냅샷에서 읽기

## 구현 범위

### 1. DB 함수 추가 (migration)

#### `public.export_schema_ddl()` (SECURITY DEFINER, admin 전용)
- `pg_catalog` + `information_schema`를 조회해 public 스키마의 다음을 SQL 텍스트로 생성:
  - `CREATE TABLE` 문 (컬럼, 타입, default, nullable)
  - `PRIMARY KEY`, `UNIQUE`, `FOREIGN KEY`, `CHECK` 제약
  - `CREATE INDEX` 문
  - `CREATE FUNCTION` (public 스키마 함수 본문)
  - `CREATE TRIGGER` 문
  - `CREATE TYPE` (enum 등)
  - `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` 문
  - `GRANT` 문
- 반환: 단일 텍스트(실행 가능한 .sql)
- 권한: `has_role(auth.uid(), 'admin')` 체크

#### `public.export_snapshot_id()` (SECURITY DEFINER)
- `pg_export_snapshot()` 호출해 snapshot id 반환
- 동일 트랜잭션 안에서 호출자가 `SET TRANSACTION SNAPSHOT`을 사용할 수 있게 함

### 2. `auto-snapshot` Edge Function 수정

기존 로직에 추가:

- **(C) 단일 시점 일관성**
  - 백업 시작 시 새 트랜잭션 열고 `export_snapshot_id()` 호출
  - 이후 모든 `SELECT`를 `SET TRANSACTION SNAPSHOT '<id>'` 후 실행
  - 실제 구현: Supabase REST API로는 트랜잭션 공유가 불가하므로, 
    **단일 RPC `dump_all_tables_consistent(snapshot_id)`를 새로 만들어 한 트랜잭션 내에서 모든 public 테이블을 JSON으로 직렬화 후 반환** 방식 채택
  - 또는 Edge Function이 `pg` 클라이언트(Deno postgres driver)로 직접 연결해 단일 트랜잭션 유지

- **(A) 스키마 DDL 백업**
  - `export_schema_ddl()` 호출 결과를 `db-backups/<timestamp>/schema.sql`로 저장

- **(B) auth.identities 백업**
  - 기존 `auth.users` 덤프 옆에 `auth.identities` 전체 row 덤프 추가
  - 저장 위치: `db-backups/<timestamp>/auth_identities.json`
  - service_role로 `auth.identities` 직접 조회

- **manifest.json 확장**
  - `schema_sql_path`, `auth_identities_path`, `snapshot_id`, `consistency: 'snapshot'` 필드 추가

### 3. `restore-snapshot` Edge Function 수정

- manifest에 `auth_identities_path`가 있으면 복원 후 `auth.identities` upsert
- 스키마 DDL은 동일 프로젝트 복원 시에는 미적용(데이터만 복원), manifest에 경로만 기록해 **수동 신규 프로젝트 복원 시 사용** 가능하도록 보관

### 4. Admin UI 보완 (`src/pages/AdminPage.tsx`)

백업 카드/모달에 다음 표시 추가:
- "Schema DDL included" 배지
- "auth.identities: N rows" 표시
- "Snapshot consistency: ✓" 표시
- 백업 항목에서 `schema.sql` 직접 다운로드 버튼

## 기술 세부사항

- **트랜잭션 일관성 구현 방식 결정**: Deno postgres driver (`https://deno.land/x/postgres`)를 `auto-snapshot`에 도입해 단일 커넥션/단일 트랜잭션 유지. service_role DB URL 사용. 이미 service_role key는 환경변수로 존재.
- **DDL 생성**: `pg_get_tabledef`는 기본 미설치이므로 `information_schema` + `pg_catalog.pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_functiondef`, `pg_get_triggerdef`를 직접 조합.
- **권한**: 모든 신규 RPC는 `SECURITY DEFINER` + admin 역할 체크 + `search_path = public, pg_catalog`.
- **용량**: 추가 산출물은 총 < 1MB (기존 1.5GB 대비 무시 가능).

## 작업 순서

1. migration: `export_schema_ddl()`, `export_snapshot_id()` 함수 생성 + admin 권한 정책
2. `auto-snapshot/index.ts` 수정: Deno postgres 도입, 단일 트랜잭션 백업, schema.sql + auth_identities.json 추가, manifest 확장
3. `restore-snapshot/index.ts` 수정: auth.identities 복원 로직 추가
4. `AdminPage.tsx`: 새 메타데이터/다운로드 버튼 노출
5. 수동 실행으로 백업 1회 → manifest, schema.sql, auth_identities.json 생성 확인 → 복원 테스트

## 변경 파일
- `supabase/migrations/<new>.sql` (신규)
- `supabase/functions/auto-snapshot/index.ts`
- `supabase/functions/restore-snapshot/index.ts`
- `src/pages/AdminPage.tsx`

승인하시면 위 순서대로 구현하겠습니다.
