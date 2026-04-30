## 요청 해석

현재 S-Curve 필터 영역의 **3개 축**(Stage / Group+Values / Team)이 임의로 자유롭게 조합 가능해야 합니다. 사용자가 든 예시:

- Stage = **All** (모든 단계)
- Group = **Subcontractor**
- Subcontractor Values = **All** (모두)
- Team = **Architectural**

→ "Architectural 팀의 데이터를 협력사별로 묶어, Start/Completion/Closure 세 stage 누적선을 동시에 표시"

## 현재 제약 (해제 대상)

`src/pages/DefectDashboardPage.tsx` 에 두 가지 제약이 있어 위 조합이 불가능합니다:

1. **368줄**: Group 드롭다운이 `disabled={scurveStage === 'all'}` — Stage=All 이면 Group 선택 자체 불가
2. **224줄**: `groupBy: scurveStage === 'all' ? null : ...` — Stage=All 이면 group breakdown 비활성
3. **382줄**: `{scurveStage !== 'all' && scurveGroup !== SCURVE_GROUP_NONE && (...)}` — Group Values 멀티셀렉트 UI 도 Stage=All 이면 숨겨짐

또한 데이터 빌더 (`buildDefectSCurveAllStages`, `src/lib/defect-dashboard-utils.ts` 431~450줄) 는 `groupBy: null` 로 고정 호출되어 그룹 분해를 지원하지 않습니다.

## 변경 계획

### A. UI 제약 해제 (DefectDashboardPage.tsx)

1. **Group 드롭다운 활성화**: 368줄 `disabled={scurveStage === 'all'}` 제거. Stage=All 에서도 Group 선택 가능.
2. **Group Values 멀티셀렉트 표시 조건**: 382줄을 `scurveGroup !== SCURVE_GROUP_NONE` 만 검사하도록 변경 (Stage 무관).
3. **groupBy 전달 조건**: 224줄을 `scurveGroup === SCURVE_GROUP_NONE ? null : scurveGroup` 으로 단순화.

### B. All-Stage S-Curve 의 그룹 분해 지원

`buildDefectSCurveAllStages` 가 그룹별 분해를 지원하도록 확장:

- `BuildSCurveOptions` 의 `groupBy` 와 동일한 옵션을 받아 각 stage 별로 그룹 시리즈를 계산
- 반환 타입에 `byStageGroups: { start: DefectSCurveSeries[]; completion: ...; closure: ... }` 추가 (선택된 협력사가 1개 이상일 때 채워짐)
- 그룹 미선택 시 기존 동작 유지

### C. All-Stage 차트 컴포넌트 (`SCurveAllPanel` 부근) 의 라인 렌더링 확장

기존: 3 stage × {Plan, Actual} = 6 라인  
변경: 그룹이 활성일 때 stage × group × {Plan, Actual} 라인. 다만 라인 수가 폭증하므로:

- 그룹 모드에서는 stage 별로 묶어 표시하되, **선택된 협력사 값 개수 × 3 stage × 2 (plan/actual)** 가 됨
- 시각적 혼잡 완화: 선택 그룹 값이 많으면 (예: >3) 자동으로 "stage 별 plan 만" 또는 "actual 만" 보이는 단순화 옵션을 둘지 — 일단 모두 표시하고 사용자 피드백 후 조정
- 색상: stage 는 dash 패턴(start=점선, completion=실선, closure=긴 점선), 그룹은 hue 로 구분

### D. 검증

- Stage=All + Group=Subcontractor + Values=Finebuild → 3개 stage × 2 (plan/actual) = 6 라인 (Finebuild 만)
- Stage=All + Group=Subcontractor + Values=All + Team=Architectural → Architectural 팀에 속한 협력사들 × 3 stage × 2
- Stage=Comp + Group=None → 기존 단일 누적선 (변동 없음)
- Y축 도메인이 선택된 데이터 범위에 맞춰 자동 조정되는지

## 변경 파일

- `src/pages/DefectDashboardPage.tsx` — 3개 UI 제약 해제, All-Stage 패널 호출부에 group 옵션 전달
- `src/lib/defect-dashboard-utils.ts` — `buildDefectSCurveAllStages` 에 `groupBy` 지원, 반환 타입 확장
- `src/pages/DefectDashboardPage.tsx` 내 `SCurveAllPanel` 컴포넌트 — 그룹별 라인 렌더링 로직 추가

## 위험 / 참고

- All-Stage + 그룹 모드는 라인 수가 많아질 수 있어 가독성 저하 가능. 이 PR 에서는 기능 활성화에 집중하고, 시각적 단순화(toggle 등)는 후속 작업으로 분리.
- KPI strip(`SCurveAllKpiStrip`) 은 stage 별 total 만 보여주므로 그룹 모드에서도 동일하게 동작 (필터된 subset 의 합계).
