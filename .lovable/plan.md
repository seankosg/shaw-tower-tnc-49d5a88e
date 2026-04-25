# Row Data 일괄 수정에 Level/Location 추가

## 요청 내용
Defect Row Data 화면(`/defects/raw-data`)의 Bulk Edit에 **Level (`area_level`)** 과 **Location (`area_location`)** 두 필드를 추가합니다.

## 현재 상태
- `BulkEditBar`가 받는 `fields` 목록은 `DefectRawDataPage.tsx`의 `bulkFields` (라인 690~719)에서 정의.
- 현재 그룹: Classification / Assignment / Status / Schedule / Notes — **Location 그룹 없음**.
- `optionFields`에 `area_level`은 이미 있고, **`area_location`은 누락**.

## 변경
**`src/pages/DefectRawDataPage.tsx`** 단일 파일.

### 1) `optionFields`에 `area_location` 추가 (538라인 근처)
```ts
area_type: uniqueOptions(items, 'area_type'),
area_level: uniqueOptions(items, 'area_level'),
area_location: uniqueOptions(items, 'area_location'),   // ← 추가
main_trade: uniqueOptions(items, 'main_trade'),
...
```

### 2) `bulkFields` 맨 앞에 "Location" 그룹 추가 (690라인 근처)
```ts
const bulkFields = useMemo<BulkEditableField[]>(() => [
  // Location  ← 신규 그룹
  { field: 'area_level',    label: getLabel('area_level'),    inputType: 'select', group: 'Location', options: optionFields.area_level },
  { field: 'area_location', label: getLabel('area_location'), inputType: 'select', group: 'Location', options: optionFields.area_location },
  // Classification
  { field: 'team', ... },
  ...
], [getLabel, optionFields]);
```

### 동작
- 행 선택 후 BulkEditBar의 "Choose field to edit…"에 새로운 **Location** 그룹이 노출되고, 그 안에 **Level / Location** 항목이 추가됩니다.
- 값은 현재 데이터에서 distinct로 수집된 풀다운 옵션에서 선택. "Clear (set blank)" 체크박스로 빈 값 일괄 적용 가능.
- 변경 사항은 기존과 동일하게 `defect_change_log`에 자동 기록되고, RLS로 권한 없는 row는 자동 skip되어 Apply 결과 토스트에 "blocked by permission" 카운트로 표시됩니다.
- Event Log에도 자동 기록(senior_user / superuser 트리거 정책 그대로 적용).

## 영향 / 위험
- 다른 일괄 편집 동작(다른 필드, 권한 체크, 변경 로그)은 변경 없음.
- DB 마이그레이션 없음. UI에만 옵션 2개 추가.
- 자동 상태 재계산(Closure/Completion Status)은 일괄 수정 경로에는 적용되지 않으므로 부작용 없음.

승인 시 즉시 위 두 곳을 수정합니다.
