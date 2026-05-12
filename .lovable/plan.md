## 문제
Defect Progress 페이지에서 그룹을 다중(예: Team · Subcontractor)으로 설정하면 행 키가 `"Architectural · Finebuild"` 형태의 합성 키가 됩니다.

그러나 셀(P/A 숫자) 또는 그룹 라벨 클릭 시 Raw Data로 넘기는 핸들러가 **첫 번째 차원(Team)만** URL 파라미터로 전달하고 두 번째 이후 차원(Subcontractor 등)은 버립니다.

증거 — 사용자 URL:
```
/defects/raw-data?source=progress&team=Arch&dateStart=2026-05-12&dateEnd=2026-05-12&stage=closure&dateField=planned_closure_date
```
→ `subcontractor=Finebuild` 가 빠져 있어, Finebuild 행의 "68"을 눌렀는데도 **Architectural 팀 전체 266건**이 표시됩니다.

원인 코드 (`src/pages/DefectProgressPage.tsx`):
```ts
// L224 / L251 — 첫 토큰만 사용, primaryGroup 한 차원만 매핑
[DEFECT_GROUP_QUERY_PARAM[primaryGroup]]: filterValueFor(groupKey.split(' · ')[0] ?? groupKey)
```
집계 키는 `getDefectCompositeGroupKey`에서 `dims.map(...).join(' · ')`로 만들어지므로, **모든 차원**을 분해해 각각의 query param으로 넘겨야 합니다.

## 수정 방안 (UI/프레젠테이션 레이어만)

`src/pages/DefectProgressPage.tsx`

1. `groupBy` 배열(또는 단일 → 배열화) 전체를 사용하는 헬퍼 추가:
   ```ts
   const groupDims = Array.isArray(groupBy) ? groupBy : [groupBy];

   const groupKeyToParams = (rowKey: string): Record<string, string> => {
     const parts = rowKey.split(' · ');
     const out: Record<string, string> = {};
     groupDims.forEach((dim, i) => {
       const raw = parts[i];
       if (raw === undefined) return;
       out[DEFECT_GROUP_QUERY_PARAM[dim]] = filterValueFor(raw);
     });
     return out;
   };
   ```
2. `handleCellClick`(L222–244)와 `handleGroupClick`(L250–252)에서 기존의 `[DEFECT_GROUP_QUERY_PARAM[primaryGroup]]: ...` 한 줄을 `...groupKeyToParams(groupKey)` 스프레드로 교체.
3. `DefectScheduleMatrix`가 행 키 외에 별도의 차원별 라벨을 분리해 넘겨주는 구조가 아니므로, 합성 키 분해는 페이지 측에서만 처리(컴포넌트 인터페이스 변경 없음).

## 검증
- 그룹 = `Team · Subcontractor`, Finebuild 행 5/12 closure "68" 클릭 → URL에 `team=Arch&subcontractor=Finebuild&dateStart=2026-05-12&dateEnd=2026-05-12&stage=closure&dateField=planned_closure_date` 가 모두 포함되고 Raw Data 건수 = 68과 일치하는지 확인.
- 단일 그룹(Team만)일 때도 회귀 없는지 확인(분해 결과가 1개 → 기존과 동일).
- `Sub-Sub` 등 3차 그룹까지 동일하게 매핑되는지 확인.

## 범위 외 (이번에 손대지 않음)
- 집계 로직, 셀 표시 숫자(daily plan), Raw Data 필터 정의 자체.
- TnC Progress (요청은 Defect 한정).
