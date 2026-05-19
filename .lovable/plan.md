## 목표
Report 탭(`/admin/report`) 접근 권한을 다음 조건으로 단순화합니다:
- `admin` 역할, OR
- `user_type = 'pm_pd'`, OR
- (`superuser` 또는 `d_superuser`) AND `profiles.team = 'Supp'`

현재 해당 사용자 6명: admin(VP), wj_lee(PM), jw_kim, ws_choi, yj_yoo, jk_kim

## 작업 단계

### 1. 데이터 업데이트
- `profiles.user_type`을 `wj_lee`에 대해 `'pm_pd'`로 변경 (insert tool)

### 2. 접근 제어 로직 변경
신규 헬퍼 `canAccessReport(roles, profile)` 추가 — 위 3가지 조건을 종합 판정.

위치: `src/lib/role-permissions.ts` (또는 `src/lib/report-access.ts` 신규 파일)

```ts
export function canAccessReport(
  roles: AppRole[],
  profile: { user_type?: string | null; team?: string | null } | null,
): boolean {
  if (roles.includes('admin')) return true;
  if (profile?.user_type === 'pm_pd') return true;
  if ((roles.includes('superuser') || roles.includes('d_superuser'))
      && profile?.team === 'Supp') return true;
  return false;
}
```

기존 `ROUTE_MIN_RANK`의 `/^\/admin\/report/` 항목은 **제거**(또는 매우 낮은 rank로 두고) — 대신 `canAccessRoute` 내부에서 `/admin/report` 경로는 별도 처리하지 않고, **페이지 컴포넌트와 사이드바에서 `canAccessReport`를 직접 호출**하도록 통일.

### 3. UI Gate 적용
- `src/pages/admin/AdminReportPage.tsx`: `useAuth()`에서 `profile`을 받아 `canAccessReport(roles, profile)`로 `hasAccess` 판정. 에러 메시지는 "Access denied. Report access is restricted to Admin, PM, and Support team Superusers." 로 변경. Code Editor 탭은 기존대로 `isAdmin`만.
- `src/components/layout/RoleGuard.tsx`: `/admin/report` 경로에 한해 `canAccessReport`를 우선 평가하도록 분기 추가 (다른 경로는 기존 `canAccessRoute` 유지).
- `src/components/layout/AppSidebar.tsx` (또는 nav items 필터링 위치): Report 메뉴 아이템을 `canAccessReport` 결과에 따라 표시/숨김.

### 4. 동작 검증
- wj_lee 로그인 → Report 탭 보임/접근 가능
- Supp 팀 superuser/d_superuser (jw_kim 등) → 접근 가능
- 비-Supp superuser (ys_lee, jh_lee 등) → 접근 차단, 사이드바에서 숨김
- senior_user (Supp 팀 ling 등 포함) → 접근 차단 (Supp 소속이어도 d_superuser 미만)
- guest/user 등 → 차단

## 기술 세부사항
- `useAuth` context는 이미 `profile`을 노출하므로 추가 페치 불필요.
- `role-permissions.ts`의 `/^\/admin\/report/` rank 항목은 보수적으로 **남겨두되 rank 0**(누구나 패스)으로 낮춰서 RoleGuard 분기에서 `canAccessReport`가 최종 판정하도록 함. (또는 완전히 제거하고 RoleGuard에 명시 분기.)
- d_superuser는 기존 `/^\/admin/` (rank 5)에서 차단되지만 `/admin/report`는 더 구체적 패턴이 먼저 매칭되므로 무방. 단 `canAccessReport`에서 d_superuser+Supp을 명시 허용해야 함.
- Realtime/profile 변경 시 RoleGuard 재평가는 기존 `useAuth` 의존성에 의해 자동 처리.

## 변경 파일 요약
- DB: `profiles` 1행 update (wj_lee)
- `src/lib/role-permissions.ts` (또는 신규 `src/lib/report-access.ts`)
- `src/pages/admin/AdminReportPage.tsx`
- `src/components/layout/RoleGuard.tsx`
- `src/components/layout/AppSidebar.tsx` (nav 필터링 위치)
