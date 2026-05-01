# S-Curve Excel Export — 화면 디자인 그대로 반영

## 목표
Dashboard (T&C + Defect)의 **Plan vs Actual — S-Curve** 패널을 현재 화면에 보이는 데이터/필터/색상/구성 그대로 Excel(.xlsx)로 내보낸다. Excel을 열면 화면과 동일한 컴포 차트(누적 라인 + Stacked Bar + Today 기준선)가 즉시 보이고, 데이터 시트에서 숫자 검증·재가공이 가능하다.

## UX
- S-Curve 카드 헤더 우측 도구 영역에 `Export Excel` 버튼 추가 (Daily/Weekly 토글 옆).
- 클릭 시 현재 적용된 모든 상태값 — **bucket(day/week)**, **start/end date**, **team filter**, **system filter**, **breakdown tab**, (Defect의 경우) **stage**, **group by**, **숨김 시리즈** — 을 그대로 반영해서 다운로드.
- 데이터 0건이면 toast 경고. 패널이 닫혀있어도 동작.
- 파일명: `SCurve_TnC_<bucket>_<start>_<end>_<yyyymmdd-hhmm>.xlsx` / `SCurve_Defect_...`

## 시트 구성 (3 시트)

**1) `Meta`** — 추출 컨텍스트 한눈에
- Module / Source page (`/dashboard` or `/defects/dashboard`)
- Exported by, Exported at, Today 기준일
- Bucket (Daily/Weekly), Date range
- Filters: Team, System, Breakdown / Stage / Group By
- Hidden series (있으면)
- Total subtests (or defects) included
- 기존 `excel-export.ts`의 메타 블록 스타일과 동일 (헤더 굵게, 회색 배경, freeze)

**2) `Data`** — 차트의 원천 데이터
- 컬럼: `Date Bucket | T1 Planned (cum) | T1 Actual (cum) | T2 Planned (cum) | T2 Actual (cum) | T1 Met | T1 Shortfall | T1 Excess | T1 Plan(Future) | T2 Met | T2 Shortfall | T2 Excess | T2 Plan(Future)`
- Defect 버전: stage/group 설정에 따라 시리즈 컬럼이 동적으로 생성
- 날짜 셀은 Excel 날짜 시리얼로 (`excel-date-cell.ts` 재사용)
- 1행 freeze, 헤더 굵게, 숫자 포맷 `#,##0`, % 컬럼은 `0.0%`
- Today 행에 옅은 빨강 배경 강조

**3) `Chart`** — 화면과 동일한 콤보 차트
- ExcelJS Chart API 사용:
  - **Stacked Bar (보조축)**: T1 4계열 + T2 4계열 — 화면과 같은 색상(파란/녹/빨/연한 톤)
  - **Line (주축, 누적)**: T1 Planned(점선), T1 Actual(실선), T2 Planned(점선), T2 Actual(실선) — 화면 hsl 컬러를 hex로 변환
  - **Today 수직 기준선**: 해당 X 카테고리에 빨간 점선 ReferenceLine 효과
- X축: bucket 라벨, Y축 좌(누적), Y축 우(증분 카운트)
- 범례 하단, 차트 크기 ~ A4 가로 절반(약 720x420px)
- 차트가 `Data` 시트의 표를 직접 참조해서, 사용자가 데이터를 수정하면 차트가 자동 갱신됨

## 색상 매핑 (화면 → Excel)
화면의 hsl 색을 hex로 고정:
```
T1 Planned line   hsl(220,65%,55%) → #4F8BD9 (점선)
T1 Actual  line   hsl(220,65%,36%) → #1F4E91 (실선)
T2 Planned line   hsl(142,50%,55%) → #5FBF7A (점선)
T2 Actual  line   hsl(0,72%,50%)   → #DC2626 (실선)
T1 Met / Shortfall / Excess / Future Plan → 화면 동일 톤
T2 Met / Shortfall / Excess / Future Plan → 화면 동일 톤
Today line                          → #DC2626 점선
```

## 변경/생성 파일
- **신규** `src/lib/scurve-excel-export.ts`
  - `exportTncSCurveToExcel({ scurve, today, filters, meta })` 
  - `exportDefectSCurveToExcel({ scurveResult, scurveAll, hiddenSeries, today, filters, meta })`
  - 공통 헬퍼: 메타 블록 작성, 색상 팔레트, 차트 빌더
- **수정** `src/pages/DashboardPage.tsx` — 헤더에 `Export Excel` 버튼 + 핸들러
- **수정** `src/pages/DefectDashboardPage.tsx` — 동일

## 비변경 사항
- `buildSCurve` / `buildDefectSCurve*` 데이터 빌더 로직은 그대로 사용 (재계산 없음)
- 화면 차트, 다른 export 기능, 권한, DB 스키마 변경 없음
- 새 라이브러리 추가 없음 (이미 들어있는 `exceljs` 사용 — 기존 `excel-export.ts`와 동일)

## 기술 메모
- ExcelJS는 BarChart + LineChart 콤보를 지원. `addChart`는 `xl/charts/chartN.xml` 를 직접 작성해야 하는 케이스가 있어, 차트 렌더가 일부 환경에서 제한적일 수 있음. 만약 콤보 차트 렌더 한계에 부딪히면 Fallback으로:
  - **Plan A**: Stacked Bar + Line 콤보 (목표)
  - **Plan B**: Line 차트(누적)와 Stacked Bar 차트(증분)를 **세로로 두 개** 배치 — 동일 X축 정렬
- 두 경우 모두 화면 정보는 100% 보존됨.

## 검증 (구현 후 자동 QA)
- 두 페이지에서 필터 조합 3가지(team 적용/미적용, day/week, 좁은/넓은 범위)로 export → Excel 열어 확인:
  - Data 시트 행 수 = 화면 차트 X 포인트 수
  - 차트 시리즈 색·이름이 화면과 일치
  - Today 마커가 올바른 X 위치
  - 메타 시트의 필터 요약이 URL 쿼리스트링과 일치
