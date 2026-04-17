

# 사용자 계정 · 권한 체계 재설계 (확정안)

## 1. DB 마이그레이션

### 1-1. `app_role` enum 교체
```sql
-- 기존: subcontractor / hdec_engineer / manager / superuser / admin
-- 신규: guest / super_guest / user / senior_user / superuser / admin

ALTER TYPE app_role RENAME TO app_role_old;
CREATE TYPE app_role AS ENUM ('guest','super_guest','user','senior_user','superuser','admin');

-- user_roles 자동 매핑
ALTER TABLE user_roles ADD COLUMN role_new app_role;
UPDATE user_roles SET role_new = CASE role::text
  WHEN 'subcontractor' THEN 'user'::app_role
  WHEN 'hdec_engineer' THEN 'user'::app_role
  WHEN 'manager' THEN 'senior_user'::app_role
  WHEN 'superuser' THEN 'superuser'::app_role
  WHEN 'admin' THEN 'admin'::app_role
END;
ALTER TABLE user_roles DROP COLUMN role;
ALTER TABLE user_roles RENAME COLUMN role_new TO role;
ALTER TABLE user_roles ALTER COLUMN role SET NOT NULL;

-- field_config.visible_to_roles / editable_to_roles 동일 변환
-- has_role / has_any_role / is_admin_or_superuser 함수 재생성 (시그니처 동일)
DROP TYPE app_role_old;
```

### 1-2. `user_type` enum 신규
```sql
CREATE TYPE user_type AS ENUM ('subcontractor','hdec','pm_pd','admin');
```

### 1-3. `profiles` 컬럼 추가
- `login_id` text UNIQUE NOT NULL
- `user_type` user_type NOT NULL DEFAULT 'hdec'
- `subcontractor_name` text NULL
- `hdec_pic_name` text NULL
- `must_change_password` boolean NOT NULL DEFAULT true

```sql
-- 서브콘 1업체 1계정 partial unique
CREATE UNIQUE INDEX profiles_subcontractor_unique
  ON profiles (subcontractor_name)
  WHERE user_type = 'subcontractor' AND subcontractor_name IS NOT NULL;
```

### 1-4. Master 테이블 신설
```sql
CREATE TABLE subcontractor_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hdec_pic_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: 모두 read, admin만 write
-- Seed: subtests에서 distinct subcontractor_name / hdec_pic_name 자동 삽입
```

### 1-5. `handle_new_user` 트리거 갱신
가짜 이메일(`{login_id}@shaw.local`) → `login_id` 추출 후 profiles에 함께 저장.

## 2. 인증 흐름 변경

### `Login.tsx`
- "Email" → **"User ID"** 라벨, type="text"
- submit 시 `signIn(`${id.toLowerCase()}@shaw.local`, password)`
- 비번 정책 안내 텍스트 표시

### `AuthContext.tsx`
- `signIn(loginId, password)`: 내부에서 `{loginId}@shaw.local`로 변환
- `signUp` 제거 (Admin만 계정 생성)
- 로그인 성공 후 `profile.must_change_password === true` 면 `/change-password` 리다이렉트
- `roles` 배열을 신규 enum 기준으로 처리

### 신규 `pages/ChangePassword.tsx`
- 현재 비번 + 신규 비번(2회) 입력
- 정규식 검증: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{6}$` (대/소/숫자 각 1개 이상, 정확히 6자)
- `supabase.auth.updateUser({ password })` + `profiles.must_change_password = false` 갱신
- 강제 라우팅: 로그인 직후 / 라우트 가드에서 처리

### `ProtectedRoute.tsx`
`must_change_password` 체크 추가 → 강제 리다이렉트

## 3. Admin Users 탭 (`AdminPage.tsx` 확장)

### 계정 생성 다이얼로그
- User ID (text, unique 검증)
- 이름
- user_type select (subcontractor / hdec / pm_pd / admin)
- role select (guest ~ admin)
- subcontractor_name select (user_type=subcontractor일 때만, `subcontractor_master`에서 dropdown)
- hdec_pic_name select (user_type=hdec/pm_pd일 때만, `hdec_pic_master`에서 dropdown)
- 초기 비번 SHAW00 자동, must_change_password=true
- 생성 방식: Edge Function `admin-create-user` (service role로 `auth.admin.createUser` 호출 + profiles/user_roles 동시 insert, 트랜잭션 보장)

### 계정 목록 테이블
- 컬럼: login_id / 이름 / user_type / subcontractor_name or hdec_pic_name / role / 활성 / 액션
- 액션: role 변경, 활성/비활성 토글, **비번 초기화 버튼** (→ Edge Function `admin-reset-password`로 SHAW00 + must_change_password=true)

### Subcontractor/HDEC PIC Master 관리 탭 (신규)
- 두 master 테이블 간단한 CRUD UI

## 4. 신규 Edge Functions

| Function | 용도 |
|----------|------|
| `admin-create-user` | service role로 사용자 생성 + profile/role 세팅 (호출자가 admin인지 검증) |
| `admin-reset-password` | service role로 비번 SHAW00 초기화 + must_change_password=true |

config.toml에 두 함수 모두 `verify_jwt = true`로 추가하고, 함수 내부에서 호출자의 admin role 검증.

## 5. 코드 정리

### `types/enums.ts`
```ts
export type AppRole = 'guest' | 'super_guest' | 'user' | 'senior_user' | 'superuser' | 'admin';
export type UserType = 'subcontractor' | 'hdec' | 'pm_pd' | 'admin';
export const ROLE_LABELS: Record<AppRole, string> = {
  guest: 'Guest', super_guest: 'Super Guest', user: 'User',
  senior_user: 'Senior User', superuser: 'Superuser', admin: 'Admin',
};
export const USER_TYPE_LABELS: Record<UserType, string> = {
  subcontractor: 'Subcontractor', hdec: 'HDEC',
  pm_pd: 'PM/PD', admin: 'Administrator',
};
```

### 기존 코드 영향
- `AuthContext`의 `isAdmin/isSuperuser/isAdminOrSuperuser` 그대로 유지
- `field_config` 등에서 사용되는 role 값은 마이그레이션에서 자동 변환됨
- 향후 통계: `subtests.subcontractor_name = profiles.subcontractor_name`으로 join → "내 데이터만 보기" / "서브콘별 KPI" 가능

## 6. 변경 파일 요약

| 파일 | 변경 |
|------|------|
| Migration (신규) | enum 교체, profiles 컬럼/인덱스, master 테이블 2개, 함수 재생성, handle_new_user 갱신 |
| `supabase/functions/admin-create-user/index.ts` | 신규 |
| `supabase/functions/admin-reset-password/index.ts` | 신규 |
| `supabase/config.toml` | 신규 함수 2개 등록 |
| `src/types/enums.ts` | AppRole/USER_TYPE 갱신 |
| `src/pages/Login.tsx` | Email→User ID, 내부 변환 |
| `src/contexts/AuthContext.tsx` | signIn ID 변환, must_change_password 체크, signUp 제거 |
| `src/components/layout/ProtectedRoute.tsx` | must_change_password 가드 |
| `src/pages/ChangePassword.tsx` | 신규 — 강제 비번 변경 |
| `src/App.tsx` | `/change-password` 라우트 추가 |
| `src/pages/AdminPage.tsx` | UsersTab 확장(생성/리셋), Subcontractor/HDEC PIC Master 탭 신설 |

## 7. 진행 순서

1. DB 마이그레이션 (enum 교체 + profiles 컬럼 + master 테이블 + seed)
2. types/enums.ts + Login + AuthContext + ProtectedRoute + ChangePassword
3. Edge Functions 2개 + config.toml
4. AdminPage Users 탭 확장 + Master 관리 탭

