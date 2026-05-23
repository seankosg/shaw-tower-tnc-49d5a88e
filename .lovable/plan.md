## Productivity Table (T&C / Defect) 추가 계획

DMR Dashboard의 KPI 서머리 카드 바로 아래, 차트 위에 협력사별 일자별 생산성 분석 테이블을 추가합니다. 기존 페이지의 Team/Trade/Subcontractor/Workplace 필터와 그대로 연동됩니다.

### 데이터 소스
- **T&C 수량**: `subtests` 테이블 — `subcontractor_name`, `team`, `t1_planned_date`, `t1_actual_date`, `t2_planned_date`, `t2_actual_date` 조회. Planned는 (t1_planned_date == 날짜) + (t2_planned_date == 날짜) 카운트 합산, Actual은 t1/t2 actual_date 동일 방식.
- **Defect 수량**: `defect_items` — `subcontractor_name`, `team`, `planned_completion_date`, `actual_completion_date` 카운트.
- **인원(분모)**: 기존 `dmr_entries`에서 해당 workplace(T&C 행은 'T&C', Defect 행은 'Defect') × 협력사 × 날짜의 manpower.

필터 적용: Team / Subcontractor는 직접 매칭. Trade 필터는 subtests/defect_items에 trade 컬럼이 없으므로 T&C/Defect 수량 카운트에는 적용하지 않음(인원 산출 시 DMR 쪽 Trade 필터는 적용). Workplace 필터는 행 표시 토글로만 사용(예: 'T&C'가 선택 해제되면 T&C 섹션 숨김, 'Defect'도 동일).

### 테이블 구조
가로축: 필터링된 날짜들 (DMR과 동일 date 범위). 각 날짜는 3 sub-column (Qty / Man / Nos·Man).
세로축: 협력사별 4행 묶음 = `T&C Planned`, `T&C Actual`, `Defect Planned`, `Defect Actual` (선택된 workplace에 따라 숨김 가능).
좌측 sticky: Subcontractor 이름(rowSpan), 우측에 Metric 라벨 컬럼.
Productivity = Qty / Manpower (소수 1자리, Man=0이면 '-'). 0/0은 '-'.

### 신규 쿼리
- `subtests` select `subcontractor_name, team, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date` where is_active=true.
- `defect_items` select `subcontractor_name, team, planned_completion_date, actual_completion_date` where is_active=true.
- 두 쿼리 모두 useQuery로 추가, 페이지 로드 시 한 번씩.

### 구현 위치
- 새 컴포넌트 `src/components/analysis/ProductivityTable.tsx` (재사용·가독성). props: `dmrRows`, `selTeams`, `selSubs`, `selWp`, `dates`.
- `DmrDashboardPage.tsx`에서 KPI 카드 아래·차트 카드 위에 삽입.

### UX 세부
- 헤더: "Productivity (Nos / Man)" + 작은 설명.
- Sticky: Subcontractor(좌측 0), Metric 라벨 컬럼.
- Planned 행 배경 옅은 muted, Actual 행 배경 background. 생산성 셀은 tabular-nums + bold.
- 값 0은 흐리게.
- 가로 스크롤 가능, 폭 cellpadding은 기존 DMR 표와 동일 톤.
