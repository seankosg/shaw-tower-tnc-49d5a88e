## 문제

`/defects/progress`에서 **Team = Mechanical** 필터를 적용한 상태로 Finebuild 5/17 Plan 셀(P=2)을 클릭했는데, Raw Data가 **40 records**를 반환합니다.

원인: `DefectProgressPage.handleCellClick`이 드릴다운 URL에 `subcontractor`, `dateStart/dateEnd`, `stage`, `dateField`만 실어 보내고, 화면 상단의 **`teamFilter` 값을 누락**합니다. 결과적으로 Raw Data는 모든 팀에 걸친 Finebuild 항목 40개를 보여주게 됩니다.

대시보드 P=2 계산:
```
filteredItems = items.filter(s => s.team === 'Mechanical')   // teamFilter 적용
→ 그 중 Finebuild + planned_closure_date == 2026-05-17 → 2개
```

Raw Data 필터(현재):
```
subcontractor_name = Finebuild
planned_closure_date = 2026-05-17
(team 필터 없음)  ← 누락
→ 40개
```

## 수정

**`src/pages/DefectProgressPage.tsx` — `handleCellClick`/`handleCriticalClick`/`handleGroupClick` 공통 처리**

1. `goRaw`에 현재 적용 중인 상단 필터를 병합하는 헬퍼 추가:
   ```ts
   const persistentFilterParams = (): Record<string,string> => {
     const out: Record<string,string> = {};
     if (teamFilter && teamFilter !== 'all') out.team = teamFilter;
     return out;
   };
   ```
2. `goRaw` 내부에서 항상 `persistentFilterParams()`를 먼저 펼친 뒤, 호출자가 전달한 `params`로 덮어쓰도록 변경:
   ```ts
   const sp = new URLSearchParams({
     source: 'progress',
     ...persistentFilterParams(),
     ...params,
   });
   ```
3. `groupKeyToParams`가 동일 키를 보낸 경우는 호출자 우선(예: Group이 Team인 경우 셀이 가리키는 팀이 우선) — 이미 spread 순서로 보장됨.

## 영향 범위

- 셀 클릭, Critical 클릭, Group 라벨 클릭 — 세 진입점 모두에 자동 반영
- Raw Data 페이지의 URL 파싱 로직(`urlMap.team → 'team'`)은 이미 존재 → 별도 수정 불필요
- Filter chip("Team: Mechanical")이 자연스럽게 함께 표시됨

## 검증

1. Progress에서 Team=Mechanical 선택 → Finebuild 5/17 P=2 클릭
2. Raw Data가 **2 records**, 칩에 `Team: Mechanical`, `Subcontractor: Finebuild`, `Planned Closure Date: 2026-05-17 ~ 2026-05-17` 모두 표시되는지 확인
3. Team=All일 때 동작은 기존과 동일(team 파라미터 미포함)

## 후속(별도 작업)

`DefectDashboardPage.goRaw`에도 동일한 누락이 있는지 함께 점검 권장(같은 패턴으로 처리). 본 플랜에는 미포함 — 사용자가 보고한 진입점은 Progress 페이지입니다.
