

# Senior User 팀 기반 수정/삭제 권한 구현

## 요약

`senior_user` 역할의 사용자가 본인 PIC 소속 subtest 외에도 같은 Team의 모든 subtest를 수정/삭제할 수 있도록 합니다. 이를 위해 `profiles` 테이블에 `team` 컬럼을 추가하고, DB 함수와 RLS 정책을 수정하며, Admin UI에 팀 배정 기능을 추가합니다.

---

## 1. DB Migration

### 1-1. `profiles` 테이블에 `team` 컬럼 추가

```sql
ALTER TABLE public.profiles
  ADD COLUMN team public.team_type DEFAULT NULL;
```

기존 `team_type` enum (`Mech`, `Elec`, `Arch`, `Supp`)을 사용합니다.

### 1-2. `can_edit_subtest` 함수 수정

현재 로직에 senior_user + 같은 team 조건을 추가합니다:

```sql
CREATE OR REPLACE FUNCTION public.can_edit_subtest(...)
-- 기존 admin/superuser 체크 유지
-- 기존 system permission 체크 유지
-- 추가: senior_user이고 같은 team이면 허용
IF public.has_role(_user_id, 'senior_user') THEN
  SELECT team INTO _user_team FROM public.profiles WHERE user_id = _user_id;
  IF _user_team IS NOT NULL THEN
    -- subtests 테이블의 team 컬럼과 비교
    -- 이 함수는 subtest의 team을 직접 받지 않으므로, 파라미터 추가 필요
  END IF;
END IF;
```

**문제**: 현재 `can_edit_subtest` 함수는 `_subcontractor_name`, `_subsub_name`만 받고 team 정보를 받지 않습니다. RLS 정책에서 `subtests.team`을 직접 비교하는 방식으로 변경합니다.

**수정 방법**: RLS UPDATE/DELETE 정책을 직접 수정하여 senior_user + 같은 team 조건을 추가합니다.

```sql
-- UPDATE 정책 수정
DROP POLICY "Users can update permitted subtests" ON subtests;
CREATE POLICY "Users can update permitted subtests" ON subtests
  FOR UPDATE TO authenticated
  USING (
    can_edit_subtest(auth.uid(), project_id, system_id, subcontractor_name, subsub_name)
    OR (
      has_role(auth.uid(), 'senior_user'::app_role)
      AND team IS NOT NULL
      AND team = (SELECT p.team FROM profiles p WHERE p.user_id = auth.uid())
    )
  );

-- DELETE 정책 수정
DROP POLICY "Authorized can delete subtests" ON subtests;
CREATE POLICY "Authorized can delete subtests" ON subtests
  FOR DELETE TO authenticated
  USING (
    is_admin_or_superuser(auth.uid())
    OR (
      has_any_role(auth.uid(), ARRAY['senior_user'::app_role])
      AND has_system_permission(auth.uid(), project_id, system_id, 'edit'::text)
    )
    OR (
      has_role(auth.uid(), 'senior_user'::app_role)
      AND team IS NOT NULL
      AND team = (SELECT p.team FROM profiles p WHERE p.user_id = auth.uid())
    )
  );
```

---

## 2. Edge Function 수정

### `admin-update-user/index.ts`

Body 인터페이스에 `team` 필드 추가, updates 객체에 포함:

```typescript
interface Body {
  // ...existing fields
  team?: 'Mech' | 'Elec' | 'Arch' | 'Supp' | null;
}
// updates 빌드 시:
if (body.team !== undefined) updates.team = body.team;
```

### `admin-create-user/index.ts`

Body에 `team` 필드 추가, `user_metadata`에 포함하고 profile 자동 생성 트리거(`handle_new_user`)에도 team 처리 추가.

---

## 3. DB 트리거 수정

`handle_new_user()` 함수에 team 컬럼 처리 추가:

```sql
v_team := (NEW.raw_user_meta_data->>'team')::public.team_type;
-- INSERT에 team 컬럼 추가
```

---

## 4. Admin UI 수정

### `src/pages/AdminPage.tsx`

**Profile 인터페이스**: `team` 필드 추가 (`TeamType | null`).

**CreateUserDialog**: Team 드롭다운 추가 (Mech/Elec/Arch/Supp + 미지정). `admin-create-user` 호출 시 `team` 전달.

**EditUserDialog**: Team 드롭다운 추가. `admin-update-user` 호출 시 `team` 전달.

**UsersTab 테이블**: Team 컬럼을 사용자 목록에 표시.

---

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| DB Migration | `profiles.team` 컬럼 추가, RLS UPDATE/DELETE 정책 수정, `handle_new_user` 트리거 수정 |
| `supabase/functions/admin-update-user/index.ts` | `team` 필드 지원 |
| `supabase/functions/admin-create-user/index.ts` | `team` 필드 지원 |
| `src/pages/AdminPage.tsx` | Profile 인터페이스, Create/Edit Dialog, Users 테이블에 team 추가 |

