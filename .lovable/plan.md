# S-Curve Group 필터 개편: 드롭다운 + 종속 다중선택

## 목표
S-Curve 툴바의 **Group** 영역을 토글 버튼들에서 **풀다운(Select)** 으로 되돌리고, Group 선택값에 따라 **2차 풀다운(다중선택)** 이 옆에 나타나 해당 차원의 실제 값(예: Subcontractor 목록)을 골라 차트에 즉시 반영합니다.

## UX 동작
- **Group 풀다운**: `None / Sub Trade / Subcontractor / Sub-Sub / HDEC PIC / HDEC ENG / Team / Work Type` 중 1개 선택 (기존 `DEFECT_GROUP_LABELS` 그대로 사용).
- **2차 풀다운 (Group Values)**:
  - Group이 `None`이면 숨김.
  - Group 선택 시 해당 차원의 고유값 목록을 `filteredItems`(Team 필터 적용 후, Group값 필터는 미적용)에서 추출, 알파벳 정렬.
  - 다중선택 가능, 빈 선택 = 전체.
  - 칩 형태로 선택값 표시, 개별 X / "Clear all" 지원.
  - Stage = `All`이면 Group 자체가 비활성 → 2차도 자동 숨김.
- Group을 변경하면 2차 선택은 초기화.
- 차트(라인/바), KPI strip, "Top N + Others" 그룹 산출, 모두 2차 선택값으로 사전 필터된 항목에서 계산.

## 차트 반영 방식
`filteredItems`에 Group값 필터를 한 번 더 적용한 `scurveItems`를 만들어 `buildDefectSCurve`에 전달:
```ts
const scurveItems = useMemo(() => {
  if (scurveGroup === SCURVE_GROUP_NONE || scurveGroupValues.length === 0) return filteredItems;
  return filteredItems.filter(it => scurveGroupValues.includes(getDefectGroupKey(it, scurveGroup)));
}, [filteredItems, scurveGroup, scurveGroupValues]);
```
`buildDefectSCurve`의 `groupBy`는 기존대로 전달 → 선택된 값들이 개별 시리즈로, 미선택 차원은 자연히 제외됨.

2차 풀다운의 옵션 목록은 `getDefectGroupKey(item, scurveGroup)`로 추출해 `getDefectGroupLabel`로 라벨링.

## URL 동기화
- `group` 파라미터: 1개 (기존 유지)
- `group_values` 파라미터 신규: 콤마 구분, 비어있으면 미설정.

## 컴포넌트 사용
- 1차: `Select` (`@/components/ui/select`) — 단일 선택, 기존 ToggleGroup 자리 교체.
- 2차: `Popover` + `Command`(checkbox 다중선택 패턴) 또는 간단히 `DropdownMenu` + `DropdownMenuCheckboxItem`. 프로젝트에 이미 사용 중인 패턴이 있다면 그것을 따름.
  - 트리거 버튼: `"Values (n)"` 또는 첫 1~2개 라벨 + `+N`.

## 변경 파일
- `src/pages/DefectDashboardPage.tsx`
  - `scurveGroup` ToggleGroup → `Select` 로 교체 (라인 333~350 영역).
  - 새 state `scurveGroupValues: string[]`, `searchParams` 초기화 / 동기화.
  - Group 변경 시 `setScurveGroupValues([])`.
  - 2차 풀다운 컴포넌트 (인라인 또는 같은 파일 내 작은 helper) 추가.
  - `scurveItems` useMemo 추가, `buildDefectSCurve` / `buildDefectSCurveAllStages` 입력은 `scurveItems` 로 변경 (단, all-stages는 group 무관이므로 `filteredItems` 유지해도 무방 — Group disabled 상태에서 2차도 숨김이므로 동일).

## 영향 범위
- Team 필터, Bucket, Stage, S-Curve 누적 0-시작 로직(이전 변경) 모두 유지.
- Breakdown 탭/표는 변경 없음 (S-Curve 한정 필터).
- 기존 `group` URL 호환성 유지.

## 비기술 요약
Group을 다시 깔끔한 드롭다운으로 바꾸고, "Subcontractor" 같은 그룹을 고르면 바로 옆에 그 안의 업체 목록 드롭다운이 떠서 보고 싶은 항목들만 골라 차트에 표시할 수 있게 합니다.
