

## 남은 작업 2~5번 일괄 마무리 plan

### 1. Admin Classification 라우트 + 사이드바 연결

```text
src/App.tsx
  + import AdminClassificationPage
  + <Route path="/admin/classification" element={<AdminClassificationPage />} />

src/components/layout/AppSidebar.tsx
  adminNav 에 추가:
    { label: 'Defect Classification', icon: Tags, path: '/admin/classification' }

(또는 AdminPage.tsx 의 Tabs 안에 새 탭으로 끼워 넣는 안도 가능 — 본 plan은 별도 라우트 + 사이드바 항목 채택. 이미 별도 페이지가 만들어져 있으므로 그대로 노출만 하면 됨)
```

### 2. DefectRawDataPage 컬럼/필터 추가

```text
src/pages/DefectRawDataPage.tsx
  - DEFECT_RAW_FIELDS 에 'work_type', 'classification_source' 추가
    (sub_trade 다음 위치)
  - RAW_SEARCH_FIELDS 에 'work_type', 'classification_source' 추가
  - 컬럼 정의:
      work_type             → 텍스트 셀 + multi-select 필터
      classification_source → 4가지(rule/discipline/manual/unclassified)
                              multi-select 필터, 색상 Badge 표시
  - URL 파라미터 매핑 추가:
      workType            → work_type
      classificationSource → classification_source
    (multi 값은 콤마 분할)
  - filteredBaseData에 추가 분기:
      'unclassified' → classification_source='unclassified'
      등 single-value 모두 위 urlMap으로 처리되므로 별도 코드 불필요

src/hooks/useDefectFieldConfig.ts
  - DEFECT_DEFAULT_FIELD_LABELS 에
      classification_source: 'Classification Source'
    추가 (work_type 은 이미 존재)
```

### 3. DefectImportPage 결과 카드 링크 수정

```text
src/pages/DefectImportPage.tsx
  Summary 카드의 navigate 경로 수정:
    /defects/raw?classificationSource=...
       ↓
    /defects/raw-data?classificationSource=...
  (현재 라우트가 /defects/raw-data 이므로 404 발생)
```

### 4. DefectExportPage 필터 + 컬럼 추가

```text
src/lib/defect-export-utils.ts
  - DefectExportFilters 에
      workType: string
      classificationSource: string
    추가
  - EMPTY_FILTERS 기본값 '' 추가는 페이지에서 처리
  - filterDefectsForExport 에 두 필터 비교 로직 추가
  - DEFECT_EXPORT_GROUPS.responsibility, schedule, progress
    그대로 유지. 신규 그룹 추가:
      classification: ['issue_no','main_trade','sub_trade','work_type',
                       'classification_source','classified_at']

src/pages/DefectExportPage.tsx
  - EMPTY_FILTERS 에 workType:'', classificationSource:''
  - FilterSelect 추가 (work_type unique, classification_source 4종)
  - columnMode Select 옵션 'classification' 추가
```

### 5. Dashboard / Progress Matrix 에 Work Type 그룹 추가

```text
src/pages/DefectDashboardPage.tsx
  - byWorkType = aggregateDefectPlanActualByGroup(... i.work_type ?? NONE_LABEL ...)
  - breakdownDataMap 에
      workType: { rows: byWorkType, header: 'Work Type', param: 'workType' }
  - TabsList 에 <TabsTrigger value="workType">By Work Type</TabsTrigger>
  - TabsContent value="workType" 에 PlanActualTable 추가
  - URL param 'tab' 기본값은 'subTrade' 유지 (호환)

src/pages/DefectRawDataPage.tsx URL 매핑에 workType:'work_type' 이미 2번에서 추가됨
  → PlanActualTable groupParam='workType' 클릭 시 RawData 필터 동작 확인

src/lib/defect-progress-utils.ts
  - DefectProgressGroupBy union 에 'work_type' 추가

src/components/defects/DefectProgressMatrix.tsx
  - QUERY_FIELD 에 work_type: 'workType' 추가

src/pages/DefectProgressPage.tsx
  - Group By Select 옵션에 'Work Type' (value='work_type') 추가
  - rows 집계 시 groupBy 'work_type' 분기 추가
```

### 영향 받는 파일 요약

```text
src/App.tsx                                    (라우트 1줄)
src/components/layout/AppSidebar.tsx           (adminNav 항목)
src/hooks/useDefectFieldConfig.ts              (label 1개)
src/pages/DefectRawDataPage.tsx                (컬럼/필터/URL)
src/pages/DefectImportPage.tsx                 (URL 경로 수정)
src/lib/defect-export-utils.ts                 (필터/그룹)
src/pages/DefectExportPage.tsx                 (UI 필터/select)
src/pages/DefectDashboardPage.tsx              (Work Type 탭)
src/lib/defect-progress-utils.ts               (groupBy union)
src/components/defects/DefectProgressMatrix.tsx (QUERY_FIELD)
src/pages/DefectProgressPage.tsx               (Group By 옵션)
```

### 검증 항목

```text
1. 사이드바 Administration 그룹에 'Defect Classification' 노출
2. /admin/classification 진입 → Keyword Rules / Discipline Fallback CRUD 동작
3. RawData 컬럼: Work Type, Classification Source 보임 + 필터 동작
4. RawData URL ?classificationSource=unclassified 직접 진입 → 필터 자동 적용
5. Import 결과 카드 카운트 클릭 → /defects/raw-data 정상 이동 (404 아님)
6. Export 페이지: Work Type / Classification Source 필터 + 'Classification' 컬럼 모드 선택 → 시트에 신규 컬럼 포함
7. Dashboard 'By Work Type' 탭 추가, 행 클릭 시 RawData work_type 필터 적용
8. Progress 페이지 Group By 'Work Type' 선택 시 매트릭스 그룹 변경
9. build + 기존 vitest 통과
```

