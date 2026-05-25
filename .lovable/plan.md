Plan: Daily Manpower by 차트 토글 기본값을 workplace로 변경

- 대상: src/pages/analysis/DmrDashboardPage.tsx
- 변경: Line 197의 `useState<'trade' | 'workplace'>('trade')` → `useState<'trade' | 'workplace'>('workplace')`
