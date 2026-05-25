## 목표
Daily Manpower by 차트의 토글 기본값을 workplace로 변경

## 상세
- 대상 파일: `src/pages/analysis/DmrDashboardPage.tsx`
- 변경 내용: Line 197 `const [chartGroupBy, setChartGroupBy] = useState<'trade' | 'workplace'>('trade');`의 초기값을 `'workplace'`로 수정

## 영향 범위
- DMR Dashboard 페이지의 "Daily Manpower by Trade/Workplace" 라인 차트 토글 기본 선택값만 변경
- 기존 데이터 로직, 필터, 테이블에는 영향 없음