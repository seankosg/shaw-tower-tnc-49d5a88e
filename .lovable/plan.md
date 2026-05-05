## 원인
`src/components/layout/RoleGuard.tsx`가 접근 거부 시 항상 `/dashboard`로 리다이렉트합니다. 그런데 직전 변경으로 `/dashboard`는 `super_guest+`만 접근 가능하게 만들었습니다 (`role-permissions.ts` 라인 61).

→ Guest가 어떤 페이지에 들어가든 `/dashboard`로 이동 → 또 거부 → 또 `/dashboard`로 이동 → **무한 리다이렉트 루프 → 빈 화면**.

또한 로그인 직후 기본 진입 경로가 `/dashboard`라면 같은 이유로 빈 화면이 됩니다.

사이드바(`AppSidebar.tsx`)의 `defectNav`는 이미 Dashboard/Progress 항목을 포함하고 있고, `/defects/dashboard`·`/defects/progress`·`/tc/dashboard`·`/tc/progress` 라우트도 존재합니다 — 권한 정책상 4개 페이지는 Guest에게 열려 있으므로, 리다이렉트만 똑똑하게 만들면 정상 동작합니다.

## 변경 사항

### 1. `src/components/layout/RoleGuard.tsx`
`if (!canAccessRoute(...)) return <Navigate to="/dashboard" replace />;` 부분을 다음으로 교체:

```tsx
if (!canAccessRoute(roles, pathname)) {
  // 사용자가 실제 접근 가능한 첫 경로로 보낸다 — 리다이렉트 루프 방지.
  const fallbacks = ['/tc/dashboard', '/defects/dashboard', '/docs/dashboard', '/dashboard'];
  const target = fallbacks.find((p) => canAccessRoute(roles, p));
  if (!target || target === pathname) {
    // 어떤 페이지도 접근 불가 → 차분한 안내 화면
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <h2 className="text-lg font-semibold">No accessible pages</h2>
        <p className="text-sm text-muted-foreground">
          Your account does not have permission to view any module. Please contact an administrator.
        </p>
      </div>
    );
  }
  return <Navigate to={target} replace />;
}
```

### 2. 로그인 후/루트 진입 시 기본 경로 점검
`src/App.tsx`(또는 Login flow)의 post-login redirect가 `/dashboard` 또는 `/`로 하드코딩되어 있다면, 위 `RoleGuard`가 처리하므로 추가 변경 불필요.
다만 `<Route path="/" element={<Navigate to="/dashboard" />} />` 같이 정적 리다이렉트가 있다면, RoleGuard로 감싸진 페이지로 가도록 두면 됩니다 (RoleGuard가 자동으로 가능한 경로로 보냄).

## 검증
- Guest 로그인 → `/tc/dashboard`로 자동 진입, T&C Dashboard·Progress·Defect Dashboard·Progress 4개 메뉴만 보이고 그 외 메뉴는 사이드바에서 자동 숨김 (이미 `filterNavItems`가 처리 중).
- 직접 URL로 `/admin` 입력해도 `/tc/dashboard`로 안전 리다이렉트.
- Super Guest 이상은 영향 없음.
