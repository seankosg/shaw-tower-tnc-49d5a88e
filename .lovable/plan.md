# HDEC ENG 필드를 Admin 사용자 관리에 추가

## 문제

현재 시스템 상태:
- **DB**: `profiles.hdec_eng_name` 컬럼 존재
- **자동 생성 흐름**: Defect Excel import 시 `auto-create-master-user` 엣지 함수가 HDEC ENG 사용자를 자동 생성하며 `hdec_eng_name`을 정상 저장
- **AuthContext**: `Profile` 타입에 `hdec_eng_name` 포함
- **handle_new_user 트리거**: `hdec_eng_name`을 raw_user_meta_data에서 읽어 저장

**그러나 Admin Page에서는**:
- HD 사용자 신규 생성 폼에 HDEC ENG 선택 옵션 **없음**
- HD 사용자 편집 다이얼로그에 HDEC ENG 선택 옵션 **없음**
- 사용자 목록의 "Sub/PIC" 컬럼에 HDEC ENG 미표시
- `admin-create-user`, `admin-update-user` 엣지 함수가 `hdec_eng_name` 필드를 받지 않음

결과: 자동 생성된 HDEC ENG 사용자를 Admin이 수정할 수 없고, Admin이 직접 HDEC ENG 사용자를 만들 수도 없음.

## 변경 사항

### 1. `supabase/functions/admin-create-user/index.ts`
- `Body` 인터페이스에 `hdec_eng_name?: string | null` 추가
- `auth.admin.createUser` 호출 시 `user_metadata`에 `hdec_eng_name` 포함

### 2. `supabase/functions/admin-update-user/index.ts`
- `Body` 인터페이스에 `hdec_eng_name?: string | null` 추가
- `updates` 객체 빌드 시 `hdec_eng_name` 처리 추가

### 3. `src/pages/AdminPage.tsx`

**신규 사용자 생성 폼 (CreateUserForm)** — `user_type === 'hdec'`일 때:
- 기존 "HDEC PIC" 셀렉트 아래에 "HDEC ENG (optional)" 셀렉트 추가
- `hdec_eng_master` 테이블에서 옵션 로드
- `hdecEngName` state 추가, 페이로드에 `hdec_eng_name` 포함

**사용자 편집 다이얼로그 (EditUserDialog)** — `user_type === 'hdec'`일 때:
- 동일한 "HDEC ENG (optional)" 셀렉트 추가
- `payloadHdecEngName` 계산 후 `hdec_eng_name` 페이로드에 포함

**사용자 목록 표시**:
- "Sub/PIC" 컬럼 (라인 ~388, 496): HDEC 유저의 경우 `hdec_pic_name || hdec_eng_name` 표시 (둘 중 채워진 값)
- 정렬 로직(라인 ~350): 동일한 폴백 적용

**Master 탭**:
- 라벨을 `"Subcontractor / HDEC PIC"` → `"Subcontractor / HDEC PIC / ENG"`로 변경
- 기존 `MasterTable`을 `hdec_eng_master`에 대해서도 추가 렌더 (기존 PIC와 동일 패턴)

### 4. 검증 포인트

- HD 사용자에게 PIC와 ENG **둘 다 선택 가능** (배타가 아님 — DB 모델상 두 필드가 독립적으로 존재)
- ENG만 선택해도 저장되고, 편집 시 그대로 표시되어야 함
- 자동 생성된 ENG 사용자(예: import으로 만들어진 사용자)를 admin이 열었을 때 ENG 필드가 채워진 상태로 보여야 함

## 영향받는 파일

- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-update-user/index.ts`
- `src/pages/AdminPage.tsx`

DB 마이그레이션은 필요 없음 (컬럼 이미 존재).
