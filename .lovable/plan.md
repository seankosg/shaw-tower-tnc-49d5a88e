## 문제 진단

Guest 로그인 시 화면이 비어 있는 원인은 두 가지입니다.

1. **로그인 직후 역할 로딩 경합 (가장 큰 원인)**
   - `AuthContext`의 `signIn` 성공 → `Login.tsx`가 즉시 `/dashboard`로 이동
   - `onAuthStateChange`에서 `setLoading(false)`는 즉시 실행되지만, `fetchUserData`(profile + user_roles)는 `setTimeout(..., 0)`으로 비동기 실행
   - 그 사이 `RoleGuard`가 한 번 렌더되며 `roles = []` 상태로 평가됨
   - `canAccessRoute([], '/tc/dashboard')`는 `rank = -1`이므로 모든 fallback도 실패 → "No accessible pages" 화면 표시

2. **기억된 경로(remembered route) 부작용**
   - 사이드바가 `getRememberedRoute('/tc/dashboard')` 등을 사용
   - Guest가 과거에 어떤 경로를 본 적이 있다면 권한 없는 URL로 이동할 위험이 있음

3. **권한 매트릭스는 이미 의도대로 설정되어 있음**
   - `role-permissions.ts`에서 Guest(rank 0) 허용 경로:
     - `/tc/dashboard`, `/tc/progress`
     - `/defects/dashboard`, `/defects/progress`
   - 그 외 모든 페이지(Raw Data, Import, Export, Quick Update, Schedule Revision, Detail, Docs, Admin)는 차단됨 → 요구사항과 일치

## 수정 계획

### 1. AuthContext: 역할 로딩이 끝날 때까지 `loading=true` 유지
- `onAuthStateChange`에서 세션이 있으면 `fetchUserData` 완료 **후**에 `setLoading(false)`
- 세션이 없을 때만 즉시 `setLoading(false)`
- `getSession()` 초기화 경로도 동일하게 처리
- 결과: `RoleGuard`가 `roles=[]` 상태로 호출되는 일이 사라짐

### 2. RoleGuard: 로딩 중에는 판정 보류
- `useAuth()`에서 `loading`을 받아 `loading === true`면 간단한 로딩 화면 표시
- 세션은 있는데 `roles`가 비어 있는 비정상 케이스에 대비해, 명확한 안내 메시지 + 로그아웃 버튼을 표시 (현재의 "No accessible pages"보다 친절하게)

### 3. RoleGuard fallback 우선순위를 Guest 친화적으로 조정
- 현재 fallback: `['/tc/dashboard', '/defects/dashboard', '/docs/dashboard', '/dashboard']`
- Guest 허용 경로 4개를 모두 우선 시도하도록 명시:
  - `/tc/dashboard` → `/tc/progress` → `/defects/dashboard` → `/defects/progress`
- 어떤 잘못된 URL이든 Guest를 곧바로 첫 번째 접근 가능한 페이지로 보냄

### 4. 사이드바: 권한 없는 remembered route 무시
- `AppSidebar`에서 `getRememberedRoute(item.path)` 결과가 현재 `roles`로 접근 불가하면 `item.path`로 강제 폴백
- Guest가 과거 세션의 잔여 URL로 튕기지 않도록 방지

### 5. Guest 권한 매트릭스 재확인 (코드 변경 없음, 검증만)
- 다음 페이지만 Guest 접근 가능:
  - T&C / Dashboard (`/tc/dashboard`)
  - T&C / Progress (`/tc/progress`)
  - Defect / Dashboard (`/defects/dashboard`)
  - Defect / Progress (`/defects/progress`)
- 그 외 모든 경로는 첫 번째 접근 가능한 페이지로 자동 리다이렉트

### 6. 검증 시나리오
- Guest 로그인 → 자동으로 `/tc/dashboard` 표시 (빈 화면 없음)
- Guest가 `/admin`, `/tc/raw-data`, `/docs/dashboard`, `/defects/import` 등 직접 입력 → `/tc/dashboard`로 리다이렉트
- 사이드바: T&C는 Dashboard/Progress 두 항목, Defect는 Dashboard/Progress 두 항목만 표시 (Docs/Admin/Raw Data/Import/Export/Quick Update/Schedule Revision/Defect Classification 모두 숨김)
- 새로고침 후에도 동일 동작
- 기존 일반 User/Admin 동작은 영향 없음

## 변경 파일
- `src/contexts/AuthContext.tsx` — 로딩 종료 시점 수정
- `src/components/layout/RoleGuard.tsx` — 로딩 가드 + fallback 순서 보강
- `src/components/layout/AppSidebar.tsx` — remembered route 권한 검증
- (필요 시) `src/lib/role-permissions.ts` — 변경 없음, 검증만

## 기술 메모
- `role-permissions.ts`의 Guest(rank 0) 매트릭스는 이미 정확함 → 코드 변경보다 **타이밍 버그**가 핵심 원인
- `ProtectedRoute`는 그대로 두고, 권한 판정만 `RoleGuard`에서 일관되게 처리
- 접속 주소 자체는 문제가 아님 (`/dashboard` → `/tc/dashboard` 리다이렉트가 올바르게 정의되어 있음)