# Defect Progress — Group 선택 UI를 ToggleGroup 다중선택 방식으로 변경

## 목적
현재 Defect Progress(`/tc/progress` 옆 Defect Progress 탭)의 Group 선택은 단일 선택 Select 드롭다운입니다. 이를 T&C Progress의 Stage 토글과 동일한 형태인 **ToggleGroup `type="multiple"`** 으로 변경하여, 여러 그룹 차원(예: Team + Subcon, Sub-Sub + Level 등)을 동시에 적용한 집계를 볼 수 있게 합니다.

## 사용자가 보게 될 변화
- Group 영역에 9개 토글 버튼이 가로로 노출 (Team / Subcontractor / Sub-Sub / HDEC PIC / HDEC ENG / Level / Main Trade / Sub Trade / Work Type) + 좌측에 `All` 단축 버튼
- 여러 개를 켜면 각 그룹 키가 `값1 · 값2` 형식으로 합쳐진 복합 라벨로 행이 생성됨
- 하나도 선택하지 않으면 자동으로 기본값(`team` 단독)으로 복귀
- URL 파라미터 `?group=` 가 `team,subcontractor_name` 처럼 콤마 구분으로 직렬화 (단일이면 기존과 동일)
- Critical Watchlist, Excel Export, 행 클릭 시 Raw Data 필터 이동 등 다운스트림은 모두 첫 번째 선택 그룹을 "primary" 로 사용하여 호환 유지

## 영향 범위
- `src/pages/DefectProgressPage.tsx` — UI 교체, 상태/URL 직렬화 변경
- `src/lib/defect-schedule-utils.ts` — `DefectAggregateOptions.groupBy` 를 `DefectScheduleGroupBy | DefectScheduleGroupBy[]` 로 확장; 그룹 키 생성/라벨 함수에서 다중 차원 합성 처리
- 다운스트림(`findDefectCritical`, `DEFECT_GROUP_QUERY_PARAM` 사용처, Excel export 헤더, Raw Data 이동) 은 **primary group(첫 번째 선택)** 만 사용하도록 보수적으로 처리하여 폭발적 변경 회피

## 기술 상세

### 1. `defect-schedule-utils.ts`
- 새 헬퍼 추가:
  ```ts
  export type DefectGroupBySpec = DefectScheduleGroupBy | DefectScheduleGroupBy[];
  const SEP = ' · ';
  export function getDefectCompositeGroupKey(item, by: DefectGroupBySpec): string;
  export function getDefectCompositeGroupLabel(by: DefectGroupBySpec, key: string): string;
  export function getPrimaryGroupBy(by: DefectGroupBySpec): DefectScheduleGroupBy;
  ```
- `aggregateDefectSchedule` 의 `opts.groupBy` 타입을 `DefectGroupBySpec` 으로 확장. 내부 `groupMap` 키 생성을 `getDefectCompositeGroupKey` 로 교체. `row.label` 은 `getDefectCompositeGroupLabel` 사용.
- `DEFECT_GROUP_LABELS` 헤더는 다중 선택 시 `Team · Subcon` 처럼 합성 표시.

### 2. `DefectProgressPage.tsx`
- 상태 변경:
  ```ts
  const [groupBy, setGroupBy] = useState<DefectScheduleGroupBy[]>(() => parseGroupParam(searchParams.get('group')));
  const groupBySpec = groupBy.length === 1 ? groupBy[0] : groupBy;
  const primaryGroup = groupBy[0] ?? 'team';
  ```
- `parseGroupParam`: 콤마 split → 유효 키 필터, 없으면 `['team']`.
- URL 직렬화: `setOrDelete('group', groupBy.join(','), 'team')`.
- UI 교체 (Stage 토글 패턴 재사용):
  ```tsx
  <ToolbarGroup label="Group">
    <Button variant={isAllGroups ? 'default' : 'outline'} onClick={() => setGroupBy([...ALL_DEFECT_GROUP_KEYS])}>All</Button>
    <ToggleGroup type="multiple" value={isAllGroups ? [] : groupBy} onValueChange={...}>
      <ToggleGroupItem value="team">Team</ToggleGroupItem>
      ...9 items
    </ToggleGroup>
  </ToolbarGroup>
  ```
- `isAllGroups` = 9개 모두 선택된 상태. 빈 배열이면 `['team']` 으로 자동 복귀.
- `findDefectCritical`, `DEFECT_GROUP_QUERY_PARAM[...]`, `exportDefectScheduleToExcel({ groupHeader })` 호출부는 모두 `primaryGroup` 으로 대체.
- Header 부 라벨은 `groupBy.map(g => DEFECT_GROUP_LABELS[g]).join(' · ')` 로 표시.

### 3. 새 export
- `defect-schedule-utils.ts` 에 `ALL_DEFECT_GROUP_KEYS: DefectScheduleGroupBy[]` 추가.

## 비포함 (Out of Scope)
- 9개 차원 전체 동시선택 시 행 폭발 가드(서버 페이지네이션 등) — 현재 데이터 규모에서 불필요
- Raw Data 이동 시 다중 필터 동시 적용 — primary group만 적용 (단순화)
- Excel Export 헤더가 합성 라벨 1열만 표시되는 구조 유지 (열 분리 안 함)

## 검증
- `bun test src/test/defect-*` 회귀 통과
- 수동: Group=Team 단독 → 기존과 동일 결과; Team + Subcon 동시 선택 → 행 라벨 `Mech · ABC Co` 등 합성; 모두 해제 → Team 단독으로 복귀; URL 새로고침 시 선택 복원
