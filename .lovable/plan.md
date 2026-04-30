문제를 다시 정리하면 이렇습니다.

- Group 미선택: 일일 세로막대가 보임
- Group 선택: 누적선/호버 숫자는 보이지만 일일 세로막대가 사라짐
- 즉, 시인성 문제가 아니라 Group 모드에서 막대가 구조적으로 빠지는 문제입니다.

Do I know what the issue is?
예. 이번에는 원인을 특정했습니다.

정확한 원인
1. 문제 파일
- `src/pages/DefectDashboardPage.tsx`
- 특히 `SCurveCharts()` 함수 내부

2. 실제 문제 로직
- `showGroups = scurve.groups.length > 0` 가 되면, 단일 Stage 차트에서:
  - `row.planInc`, `row.actualInc` 를 데이터 row에 넣지 않고
  - 상단 일일 막대 `<Bar dataKey="planInc" />`, `<Bar dataKey="actualInc" />` 도 `!showGroups` 조건으로 아예 렌더링하지 않습니다.
- 즉, Group 선택 순간 막대는 “색이 연해서 안 보이는 것”이 아니라 “그릴 데이터도 없고 컴포넌트도 빠지는 상태”가 됩니다.

3. 왜 호버 숫자는 보이는데 막대는 안 보이냐
- 현재 Group 모드에서는 `g_plan_*`, `g_actual_*` 그룹별 누적선 데이터만 남아 있습니다.
- 그래서 툴팁에는 선 데이터 값이 나오지만, 막대용 `planInc`/`actualInc` 시리즈는 존재하지 않아 화면에 세로막대가 없습니다.

4. 왜 이전 색상 수정으로 해결되지 않았나
- 색상 문법 이슈는 SVG fill 호환성 문제였고,
- 이번 증상은 그 이전 단계인 “Group 모드에서 막대 렌더링 자체를 꺼버린 조건문”이 본질입니다.

외부 확인
- Recharts 관련 동작도 확인했습니다. `Bar`는 chart data row에 해당 `dataKey` 값이 있어야 하고, 컴포넌트 자체를 조건부로 빼면 당연히 막대가 나오지 않습니다.
- 툴팁이 다른 series 데이터를 계속 보여주는 상황과, 막대가 없는 상황은 동시에 발생할 수 있습니다.

수정 계획
1. 단일 Stage `SCurveCharts()`를 all-stage 패턴과 동일하게 정리
- Group 모드여도 `planInc`, `actualInc`, `variance`를 항상 계산
- 기준은 사용자가 요청한 대로 “선택된 그룹들의 합계”

2. Group 모드에서도 상단 일일 Bar를 항상 렌더링
- 현재 `!showGroups` 조건으로 막아둔 `Bar` 두 개 제거
- Group 선택 여부와 무관하게 daily bars 표시

3. 툴팁/범례 일관성 보정
- Group 모드에서는 막대 설명이 “selected groups summed daily plan/actual” 의미와 맞도록 유지
- 누적선과 막대 합계가 서로 같은 기준을 쓰도록 검증

4. 필요 시 축 스케일 미세조정
- daily 막대 축(`yAxisId="bar"`)이 increments 합계 기준으로 안정적으로 보이도록 확인
- 하지만 1차 원인은 축/색상이 아니라 렌더링 조건문입니다

예상 수정 포인트
- `src/pages/DefectDashboardPage.tsx`
  - `SCurveCharts()`의 data 생성부
  - `!showGroups && <Bar ... />` 조건부 렌더링 제거
  - Group 모드에서 `planInc`, `actualInc` 합산값 주입

승인해 주시면 이 근본 원인 기준으로 바로 수정하겠습니다.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>