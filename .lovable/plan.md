## 목표
Analysis 그룹에 Dashboard 탭 추가. dmr_entries 데이터로 일일 인원 선형차트 + 연동 피벗 테이블.

## 추가/수정 파일
- `src/pages/analysis/DmrDashboardPage.tsx` (신규)
- `src/components/layout/AppSidebar.tsx` — Dashboard 항목 추가
- `src/App.tsx` — 라우트 추가

## 기능
1. 데이터: supabase `dmr_entries` select 전체, React Query 캐시, 클라이언트 필터.
2. 필터 4개 (Team/Trade/Subcontractor/Workplace): 모두 다중선택 + All 토글 popover.
3. 선형차트: X=날짜, Y=sum(manpower). 컨테이너 고정, Y축 nice round 능동 스케일.
4. 피벗 테이블: 가로=날짜 → 하위=Day Total(가장 왼쪽, 굵게) + 선택 Workplace. 세로=Subcontractor(알파벳 오름차순). 하단 Day Total 행. 우측 Row Total. 0 dim. sticky left + 가로스크롤.
5. 상단 KPI 4개 카드: Total man-days, Avg/day, Peak day, Days covered.
6. 디자인: Inter, Card 레이아웃, 다른 dashboard와 톤 일치.