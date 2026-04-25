# HDEC ENG 사용자 자동 등록

## 목표

엑셀 import 시 `hdec_eng_name` 값이 발견되면 다른 마스터(Subcontractor/Sub-Sub/HDEC PIC)와 동일하게 **로그인 가능한 사용자 계정**도 자동 생성합니다. 또한 HDEC ENG profile을 Team 자동 판별에 활용합니다.

## 현재 상태

- `hdec_eng_master` 테이블에는 자동 insert됨 ✅
- 사용자 계정은 자동 생성 안 됨 ❌
- `profiles` 테이블에 `hdec_eng_name` 컬럼 없음 → 사용자와 HDEC ENG를 매핑할 방법이 없음

## 변경 사항

### 1. 데이터베이스 (마이그레이션)

`profiles` 테이블에 `hdec_eng_name` 컬럼 추가:
- `hdec_eng_name text` (nullable)

### 2. Edge Function: `auto-create-master-user`

- `MasterType`에 `'hdec_eng'` 추가
- Body 인터페이스에 `hdec_eng_name?: string | null` 추가
- `userType` 매핑: `hdec_eng` → `'hdec'` (user_type enum)
- `findExistingMasterUser`: `hdec_eng_name` 컬럼으로 중복 체크
- `suggestBase`: HDEC PIC와 동일한 `picSnake()` 방식 (사람 이름이므로) 사용
- `user_metadata`에 `hdec_eng_name` 포함하여 `handle_new_user()` 트리거가 profile에 저장하도록

### 3. DB 트리거: `handle_new_user`

- `raw_user_meta_data->>'hdec_eng_name'`을 읽어 profile insert에 포함

### 4. 자동 생성 로직: `src/lib/defect-master-autocreate.ts`

- `MasterType` 유니온에 `'hdec_eng'` 추가
- `ensureHdecEng()` 함수 끝에 `await createMasterUser('hdec_eng', name, null)` 호출 추가
- profile 중복 체크용 `profileKeys`에 `hdec_eng:` 키 추가
- `createMasterUser` 호출 시 body에 `hdec_eng_name` 필드 전달

### 5. Team 자동 판별: `src/contexts/DefectImportContext.tsx`

- `buildProfileTeamMap()`에서 `hdec_eng_name`도 select하고 bucket 키에 포함
- `resolveDefectTeam()` fallback chain에 `hdec_eng_name` 매핑 추가:
  ```
  team(엑셀) → trade_detail → subcontractor → subsub → hdec_eng → null
  ```

### 6. AuthContext / 관련 타입

- `Profile` 인터페이스에 `hdec_eng_name: string | null` 추가
- 기타 profile 사용 페이지(Admin 사용자 관리 등)는 표시 필요 시 후속 추가 (이번 범위 외)

## 영향 범위 / 주의사항

- 기존 HDEC ENG 마스터 데이터에 대해서는 자동 backfill 하지 않음. 차후 import 시점부터 사용자 계정이 만들어짐 (요청 시 일회성 backfill 스크립트 제공 가능).
- 자동 생성된 HDEC ENG 사용자는 `user_type='hdec'`, `role='user'`, 기본 비밀번호 `Shaw@2026!`, `must_change_password=true`로 생성됩니다 (기존 HDEC PIC와 동일).
- `hdec_eng_name`만 있는 profile은 `hdec_pic_name`이 null이므로 권한 함수(`get_defect_edit_scope` 등)에서는 별도 권한이 부여되지 않습니다. 즉 ENG 계정은 로그인은 되지만 본인이 담당한 defect를 자동으로 편집할 권한은 없는 상태(필요 시 별도 정책 추가 필요).

## 변경 파일 목록

- 마이그레이션: `profiles.hdec_eng_name` 컬럼 추가, `handle_new_user()` 함수 업데이트
- `supabase/functions/auto-create-master-user/index.ts`
- `src/lib/defect-master-autocreate.ts`
- `src/contexts/DefectImportContext.tsx`
- `src/contexts/AuthContext.tsx` (Profile 인터페이스)

승인하시면 위 순서대로 적용합니다.
