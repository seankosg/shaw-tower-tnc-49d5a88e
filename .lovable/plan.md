

# Profiles 테이블 RLS 정책 추가 + 에러 핸들링

## 요약

Admin/Superuser가 다른 유저의 프로필(is_active 등)을 수정할 수 있도록 RLS 정책을 추가하고, 토글 실패 시 에러를 표시하도록 개선합니다.

## 원인

`profiles` 테이블의 UPDATE RLS 정책이 `user_id = auth.uid()`만 허용 — Admin도 타 유저 프로필 수정 불가.

## 변경 내용

### 1. DB 마이그레이션 — profiles UPDATE 정책 추가

```sql
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_admin_or_superuser(auth.uid()))
WITH CHECK (is_admin_or_superuser(auth.uid()));
```

### 2. `src/pages/AdminPage.tsx` — 에러 핸들링 추가

`toggleActive` 함수에서 update 결과의 error를 체크하고 실패 시 toast로 알림:

```typescript
const toggleActive = async (profile: Profile) => {
  const { error } = await supabase.from('profiles').update({ is_active: !profile.is_active }).eq('id', profile.id);
  if (error) {
    toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    return;
  }
  toast({ title: profile.is_active ? 'User deactivated' : 'User activated' });
  load();
};
```

Master 탭의 `confirmToggle` cascade update에도 동일한 에러 핸들링 추가.

## 수정 대상

| 대상 | 변경 |
|------|------|
| DB 마이그레이션 | profiles 테이블에 Admin UPDATE 정책 추가 |
| `src/pages/AdminPage.tsx` | toggleActive, confirmToggle에 에러 핸들링 추가 |

