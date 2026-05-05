## Quick Update 메뉴 숨김

### 변경 사항
사이드바에서 T&C 및 Defect 양쪽의 **Quick Update** 메뉴 항목을 제거하여 보이지 않게 합니다.

### 수정 파일
- `src/components/layout/AppSidebar.tsx`
  - `mainNav` 배열에서 `{ label: 'Quick Update', path: '/tc/quick-update' }` 항목 제거
  - `defectNav` 배열에서 `{ label: 'Quick Update', path: '/defects/quick-update' }` 항목 제거

### 유지 사항
- 라우트 자체(`/tc/quick-update`, `/defects/quick-update`)와 페이지 컴포넌트는 그대로 둡니다 — 직접 URL 접근은 가능하며, 권한 규칙(`role-permissions.ts`)도 변경하지 않습니다.
- 향후 다시 필요해지면 사이드바 항목만 복원하면 됩니다.

사이드바 외 다른 위치(대시보드 등)에서 Quick Update로 가는 진입점이 있다면 그건 그대로 유지합니다. 완전히 비활성화(라우트 제거 포함)를 원하시면 말씀 주세요.