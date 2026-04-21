

# DB enum에 `subsub` 추가 — 전체 플랜

## 요약

`user_type` enum에 `'subsub'` 값을 추가하여 Sub-Sub 사용자를 DB 레벨에서 명확히 구분합니다. 이에 따라 DB 함수, Edge Function, Admin UI를 모두 수정합니다.

---

## 1. DB Migration

### 1-1. enum에 `subsub` 값 추가

```sql
ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'subsub';
```

### 1-2. `can_view_subtest` 함수 수정

현재 `_user_type = 'subcontractor'` 블록에서 subsub 매칭을 처리하고 있으므로, `'subsub'`도 동일하게 처리:

```sql
-- 변경: IF _user_type = 'subcontractor' THEN
-- →    IF _user_type IN ('subcontractor', 'subsub') THEN
```

### 1-3. `can_edit_subtest` 함수 수정

동일하게:

```sql
-- 변경: IF _user_type = 'subcontractor' THEN
-- →    IF _user_type IN ('subcontractor', 'subsub') THEN
```

### 1-4. `handle_new_user` 트리거 — 변경 불필요

이미 `raw_user_meta_data->>'user_type'`을 그대로 cast하므로 `'subsub'`이 enum에 추가되면 자동 처리됩니다.

### 1-5. `auto-create-master-user` Edge Function의 DB 조회 — 아래 섹션에서 처리

---

## 2. Edge Function 수정

### `admin-create-user/index.ts`

Body 인터페이스의 `user_type` 타입에 `'subsub'` 추가:

```typescript
user_type: 'subcontractor' | 'subsub' | 'hdec' | 'pm_pd' | 'admin';
```

### `admin-update-user/index.ts`

동일하게 Body의 `user_type`에 `'subsub'` 추가:

```typescript
user_type?: 'subcontractor' | 'subsub' | 'hdec' | 'pm_pd' | 'admin';
```

### `auto-create-master-user/index.ts`

`findExistingMasterUser`에서 subsub 마스터 유저의 `user_type` 조회 시:

```typescript
// 변경: .eq('user_type', ... ? 'hdec' : 'subcontractor')
// →    subsub 타입이면 'subsub', sub 타입이면 'subcontractor'
const userType = body.master_type === 'hdec_pic' ? 'hdec' 
  : body.master_type === 'subsub' ? 'subsub' 
  : 'subcontractor';
```

신규 유저 생성 시에도 동일하게 `userType` 결정 로직 수정.

---

## 3. TypeScript enum 수정

### `src/types/enums.ts`

```typescript
// 변경
export type UserType = 'subcontractor' | 'subsub' | 'hdec' | 'pm_pd' | 'admin';
export const ALL_USER_TYPES: UserType[] = ['subcontractor', 'subsub', 'hdec', 'pm_pd', 'admin'];
export const USER_TYPE_LABELS: Record<UserType, string> = {
  subcontractor: 'Subcontractor',
  subsub: 'Sub-Sub',
  hdec: 'HDEC',
  pm_pd: 'PM/PD',
  admin: 'Administrator',
};
```

---

## 4. Admin UI 수정 (`src/pages/AdminPage.tsx`)

### Profile 인터페이스

`user_type` 타입이 이미 `UserType`을 사용하므로 자동 반영.

### CreateUserDialog

- User Type 드롭다운에 `Sub-Sub` 옵션 추가
- `Sub-Sub` 선택 시 `user_type = 'subsub'`로 전송, Subcontractor + Sub-Sub Company 드롭다운 표시
- `Subcontractor` 선택 시 기존대로 `user_type = 'subcontractor'`

### EditUserDialog

- 편집 시 `user_type === 'subsub'`이면 Sub-Sub로 표시
- User Type 변경 가능

### UsersTab 테이블

- Type 컬럼에 `USER_TYPE_LABELS`를 사용하여 `Sub-Sub` 표시

---

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| DB Migration | `user_type` enum에 `'subsub'` 추가, `can_view_subtest`/`can_edit_subtest` 함수 수정 |
| `src/types/enums.ts` | `UserType`에 `'subsub'` 추가, 라벨 추가 |
| `supabase/functions/admin-create-user/index.ts` | Body `user_type`에 `'subsub'` 추가 |
| `supabase/functions/admin-update-user/index.ts` | Body `user_type`에 `'subsub'` 추가 |
| `supabase/functions/auto-create-master-user/index.ts` | `userType` 결정 로직에 `'subsub'` 분기 추가 |
| `src/pages/AdminPage.tsx` | Create/Edit Dialog에 Sub-Sub 타입 옵션, 테이블 라벨 표시 |

