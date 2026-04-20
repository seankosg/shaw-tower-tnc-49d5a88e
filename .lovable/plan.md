

## 사이드바 메뉴 라벨 변경

### 변경 내용
`src/components/layout/AppSidebar.tsx`의 `mainNav` 배열에서 라벨만 수정:

| 현재 | 변경 후 |
|---|---|
| Schedule | **Progress** |
| Test Status | **Raw Data** |

경로(path)와 아이콘은 그대로 유지 — 라우팅 영향 없음.

```tsx
const mainNav = [
  { label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
  { label: 'Progress',  icon: Calendar,  path: '/schedule' },
  { label: 'Raw Data',  icon: Database,  path: '/' },
  { label: 'Import',    icon: Upload,    path: '/import' },
  { label: 'Export',    icon: Download,  path: '/export' },
];
```

### 검증
1. 사이드바에 Dashboard → Progress → Raw Data → Import → Export 순으로 표시
2. Progress 클릭 시 `/schedule` 페이지 정상 진입
3. Raw Data 클릭 시 `/` 페이지 정상 진입

