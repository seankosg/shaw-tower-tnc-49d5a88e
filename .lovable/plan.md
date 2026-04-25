## 변경 요청 요약

Defect Executive Dashboard의 **Plan vs Actual - Summary** 탭에 다음 두 가지를 적용합니다.

1. **By HDEC ENG** 탭 신규 추가 (`hdec_eng_name` 기준 집계)
2. 페이지 진입 시 기본 활성 탭을 **By Subcontractor**로 변경 (현재는 `By Sub Trade`)

---

## 변경 파일

### 1) `src/pages/DefectDashboardPage.tsx`

**(a) 기본 탭 값 변경**
- `useState` 초기값: `searchParams.get('tab') || 'subTrade'` → `searchParams.get('tab') || 'subcon'`
- URL 동기화 default 비교값도 동일하게 `'subcon'`으로 변경 (기본일 땐 URL에서 `tab` 파라미터 제거)
- `breakdownDataMap[breakdownTab] ?? breakdownDataMap.subTrade` fallback도 `breakdownDataMap.subcon`으로 변경

**(b) HDEC ENG 집계 추가**
- `byHdecEng` 신규 메모이제이션 추가:
  ```ts
  const byHdecEng = useMemo(
    () => aggregateDefectPlanActualByGroup(
      filteredItems, today, dataDate,
      i => (i as any).hdec_eng_name ?? NONE_LABEL,
      k => k
    ),
    [filteredItems, today, dataDate]
  );
  ```
- `GroupParam` 유니언 타입에 `'hdecEng'` 추가
- `breakdownDataMap`에 `hdecEng: { rows: byHdecEng, header: 'HDEC ENG', param: 'hdecEng' }` 추가

**(c) 탭 UI 추가**
- `TabsList`에 `<TabsTrigger value="hdecEng">By HDEC ENG</TabsTrigger>` 추가 (By HDEC PIC 다음 위치)
- `<TabsContent value="hdecEng">` 추가 — `PlanActualTable`에 `groupParam="hdecEng"`, `groupHeader="HDEC ENG"` 전달

### 2) `src/pages/DefectRawDataPage.tsx`

`PlanActualTable`이 그룹 행 클릭 시 navigate 하는 URL param `hdecEng`를 raw-data 페이지의 컬럼 필터로 매핑해야 클릭 드릴다운이 동작합니다.

- `urlMap`에 `hdecEng: 'hdec_eng_name'` 추가
- `activeUrlFilters` labels에 `hdecEng: 'HDEC ENG'` 추가

`hdec_eng_name`은 이미 데이터 모델/필터/컬럼에 존재하므로 추가 마이그레이션은 불필요합니다.

---

## 동작 결과

- 페이지 첫 진입 시 **By Subcontractor** 탭이 자동 선택됨 (URL에 `tab` 파라미터 없을 때).
- 탭 순서: By Sub Trade · **By Subcontractor (기본)** · By Sub-Sub · By HDEC PIC · **By HDEC ENG (신규)** · By Team · By Work Type
- HDEC ENG별 Plan vs Actual 집계가 표시되고, 그룹 클릭 시 `hdecEng=값` 파라미터로 Raw Data 페이지가 필터링되어 열림.
- Excel export(`handleBreakdownExport`)도 새 탭에서 자동으로 동작 (헤더 "HDEC ENG").
