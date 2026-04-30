## Group 모드 S-Curve에 일일 막대 추가

### 진단 (확정)
`src/pages/DefectDashboardPage.tsx:1212` 주석 — `Group mode: per stage × per group cumulative lines only (no daily bars).` 즉 **시인성 문제가 아니라 의도적으로 막대를 그리지 않는 분기**입니다. 데이터가 등록되지 않으므로 투명도/색을 바꿔도 보이지 않습니다.

### 변경 파일
`src/pages/DefectDashboardPage.tsx` (단일 파일)

### 구체 변경

1. **데이터 빌더 (line 1211–1234, Group 모드 분기)**
   - 기존 `planSum / actualSum / prevPlanSum / prevActualSum` 계산을 활용해 Stage별 일일 합계 행을 추가:
     - `row[`planInc_${s}`] = planSum - prevPlanSum`
     - `row[`actualInc_${s}`] = anyActualNull ? null : (actualSum - prevActualSum)`
   - 누적선용 `gp_${s}_${gk}` / `ga_${s}_${gk}`는 그대로 유지

2. **보조 Y축 활성화 (line 1285–1287)**
   - `!isGroupMode` 조건 제거 → Group 모드에서도 우측 `yAxisId="bar"` 렌더

3. **Stage별 stacked Bar 렌더 (line 1293–1308)**
   - Bar 두 줄(plan stack / actual stack)을 `!isGroupMode` 분기 밖으로 이동, 항상 렌더
   - 누적선(`cumPlan_*`, `cumActual_*`)은 비-Group에서만 유지
   - Group별 누적선(line 1309–1341)은 그대로

4. **ChartConfig (line 1240–1256)**
   - Group 모드 cfg에도 `planInc_${s}` / `actualInc_${s}` 항목 추가 → 범례·툴팁 라벨 정상 표시

### 시각 결과
- "None" 화면과 동일한 **Stage별 stacked daily bars** + Today 기준 향후 계획 막대가 Subcontractor / 특정 서브콘 선택 시에도 표시됨
- 합계 의미: 선택된 그룹들의 plan/actual 일일 증가분 합 (누적선의 합과 일관)
- 누적선은 기존대로 Stage 색 + Group dash 패턴 유지

### 영향 없음
- DB·유틸(`defect-dashboard-utils.ts`)·테스트 변경 없음
- 비-Group 모드 동작 변화 없음
