

## Admin 메뉴 클릭 시 Classification 페이지로 잘못 이동되는 버그 수정

### 원인

```text
useRouteMemory.ts 가 /admin/classification 방문을 last-route:/admin 키로 저장.
사이드바 Admin 클릭 시 getRememberedRoute('/admin') 가
저장된 '/admin/classification' 을 반환 → AdminPage 대신 Classification 페이지가 열림.

추가로 Defect Classification 메뉴는 이제 Defect Management 그룹으로 이동했으므로,
/admin/classification 은 더 이상 Admin 메뉴의 기억 대상이 아니어야 함.
```

### 수정 사항

```text
[src/hooks/useRouteMemory.ts]
1) ROUTE_KEYS 에 '/admin/classification' 을 '/admin' 보다 먼저 매칭되도록 추가
   (정렬은 길이 desc 이므로 자동으로 /admin/classification 이 우선 매치됨)

2) routeKeyForPath 가 /admin/classification 방문 시
   '/admin' 키가 아닌 '/admin/classification' 키로 저장하도록 함
   → Admin 메뉴 클릭은 항상 /admin (또는 이전에 저장된 /admin/* 중
     classification 이외 경로) 로 이동
```

수정 후 `useRouteMemory.ts`:

```ts
const ROUTE_KEYS = [
  '/dashboard',
  '/raw-data',
  '/schedule/revision',
  '/schedule',
  '/import',
  '/import/logs',
  '/export',
  '/mobile',
  '/admin/classification',  // ← 추가 (먼저 매치되도록)
  '/admin',
];
```

### 일회성 정리(선택)

```text
이미 사용자 브라우저에 저장된 'last-route:/admin' = '/admin/classification' 값을
정리하기 위해, useRouteMemory 안에서 1회성 마이그레이션 추가:
  if (localStorage.getItem('last-route:/admin') === '/admin/classification') {
    localStorage.removeItem('last-route:/admin');
  }
```

### 영향 받는 파일

```text
[수정] src/hooks/useRouteMemory.ts
```

### 검증

```text
1. Admin 메뉴 클릭 → AdminPage 가 표시됨 (Classification X)
2. Defect Management > Defect Classification 클릭 → AdminClassificationPage 표시
3. Admin 내부 탭 이동(/admin?tab=...) 후 다른 메뉴 → Admin 재클릭 시
   마지막 Admin 탭이 유지됨 (기존 동작 보존)
```

