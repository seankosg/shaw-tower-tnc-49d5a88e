
## 구현 계획: Defect Management 기능 고도화 5종

요청하신 5개 기능을 Defect Management 기준으로 구현하겠습니다.

```text
1. Progress Matrix
2. Daily / Cumulative Chart
3. Subcontractor Issue No 관리
4. Advanced Export
5. Admin Field Config 고도화
```

전체 방향은 T&C Management의 사용 방식과 최대한 동일하게 맞추되, Defect 데이터 구조(`defect_items`, `defect_daily_snapshots`, `defect_field_config`)에 맞게 구현합니다.

---

## 1. Progress Matrix

Defect Progress 화면(`/defects/progress`)을 현재 Dashboard 재사용 구조에서 분리하여, Defect 전용 Progress Matrix 화면으로 고도화합니다.

### 구현 내용

`defect_items`의 날짜 필드를 기준으로 Plan / Actual 진행 현황을 matrix 형태로 표시합니다.

```text
Plan 기준:
- planned_date
- target_date

Actual 기준:
- closed_date
- actual_progress_pct / closure_status
```

기본 matrix 구성:

```text
Group By:
- Team
- Subcontractor
- Sub-Subcontractor
- HDEC PIC
- Level
- Main Trade
- Sub Trade

Bucket:
- Daily
- Weekly

Metric:
- Planned
- Closed
- Open
- Overdue
- Progress %
```

예시 UI:

```text
Defect Progress Matrix

Group By: [Team]   Bucket: [Week]   Date Range: [Start] ~ [End]

Group              Total   Closed   Open   Overdue   Progress   2026-W01   2026-W02   2026-W03
Mechanical         120     80       40     12        66.7%      10 / 8     12 / 9     15 / 11
ABC Contractor     45      30       15     5         66.7%      4 / 3      6 / 5      8 / 7
```

각 bucket cell은 `Plan / Actual` count를 표시하고, 클릭 시 해당 조건으로 Raw Data를 필터링할 수 있게 연결합니다.

### 수정 대상

```text
src/pages/DefectProgressPage.tsx
src/lib/defect-progress-utils.ts
src/components/defects/DefectProgressMatrix.tsx
```

---

## 2. Daily / Cumulative Chart

Defect Dashboard 또는 Defect Progress 화면에 Daily / Cumulative chart를 추가합니다.

### 구현 내용

날짜별 defect 진행 추이를 차트로 표시합니다.

```text
Daily Chart:
- Daily Planned
- Daily Closed
- Daily New / Updated 가능 시 표시

Cumulative Chart:
- Cumulative Planned
- Cumulative Closed
- Cumulative Open
```

데이터 기준:

```text
planned_date / target_date → Planned curve
closed_date → Actual / Closed curve
created_at 또는 source_upload_id 기준 → 신규 defect 추이
defect_daily_snapshots → snapshot 기반 progress trend
```

기본 UI:

```text
Chart Type: [Daily] [Cumulative]
Date Field: [Planned Date] [Target Date]
Group Filter: [Team / Subcontractor / Level]
```

차트는 기존 프로젝트의 `recharts` 기반 chart UI 패턴을 사용합니다.

### 수정 대상

```text
src/pages/DefectDashboardPage.tsx
src/pages/DefectProgressPage.tsx
src/lib/defect-chart-utils.ts
src/components/defects/DefectDailyCumulativeChart.tsx
```

---

## 3. Subcontractor Issue No 관리

현재 `defect_items.subcontractor_issue_no` 컬럼은 존재하며, Detail / Export / Schedule Revision 일부에서 이미 사용 중입니다. 이를 관리 기능으로 확장합니다.

### 구현 내용

#### 3-1. Raw Data 검색/표시 강화

Defect Raw Data에서 `Subcontractor Issue No`를 주요 컬럼으로 표시하고 검색 대상에 포함합니다.

```text
Issue No
Subcontractor Issue No
Subcontractor Issue Source
Status
Progress
Subcontractor
HDEC PIC
```

#### 3-2. Detail 화면 관리 강화

Defect Detail에서 아래 필드를 명확히 관리합니다.

```text
Subcontractor Issue No
Subcontractor Issue Source
```

변경 시 `defect_change_log`에 기록합니다.

#### 3-3. Import 중복/매핑 처리

Import 시 `issue_no`를 primary matching key로 유지하되, `subcontractor_issue_no`도 보조 식별값으로 저장/갱신합니다.

중복 탐지 UX는 다음처럼 표시합니다.

```text
Same Subcontractor Issue No found in multiple imported rows
```

단, 데이터 충돌을 피하기 위해 실제 upsert 기준은 계속 `issue_no`로 유지합니다.

#### 3-4. 필터 추가

Raw Data / Export / Progress에서 `Subcontractor Issue No`로 필터링 가능하게 합니다.

### 수정 대상

```text
src/pages/DefectRawDataPage.tsx
src/pages/DefectDetailPage.tsx
src/pages/DefectImportPage.tsx
src/lib/defect-utils.ts
```

DB schema 변경은 필요 없습니다.

---

## 4. Advanced Export

현재 Defect Export는 단순 전체 active defect export입니다. 이를 T&C Export와 유사한 필터 기반 고급 Export로 확장합니다.

### 구현 내용

Defect Export 화면에 필터를 추가합니다.

```text
Team
Status / Closure Status
Subcontractor
Sub-Subcontractor
HDEC PIC
Main Trade
Sub Trade
Level
Date Range
Date Field:
  - Planned Date
  - Target Date
  - Closed Date
Updated Date Range
Text Search:
  - Issue No
  - Subcontractor Issue No
  - Location
  - Description
```

Export options:

```text
Columns:
- All Columns
- Visible / Field Config Columns
- Responsibility Fields
- Schedule Fields
- Progress Fields

Format:
- Raw Data
- Summary by Group
- Schedule Revision included
```

Excel 결과는 기본적으로 아래 시트를 포함합니다.

```text
1. Defects
2. Summary
3. Export Info
```

고급 Export에서는 `defect_field_config`의 display name / visibility / sort order를 반영합니다.

### 수정 대상

```text
src/pages/DefectExportPage.tsx
src/lib/defect-excel-export.ts
src/lib/defect-export-utils.ts
```

DB schema 변경은 필요 없습니다.

---

## 5. Admin Field Config 고도화

현재 Admin Field Config는 T&C의 `field_config`만 관리합니다. 이를 Defect의 `defect_field_config`까지 관리하도록 확장합니다.

### 구현 내용

Admin > Field Config 탭 안에 sub-tab을 추가합니다.

```text
[T&C Fields] [Defect Fields]
```

각 field config에서 아래 기능을 제공합니다.

```text
- Display Name 수정
- Visible toggle
- Required toggle
- Sort Order 변경
- Role visibility 관리
- Role editability 관리
```

현재 DB에는 이미 아래 컬럼이 존재합니다.

```text
field_config.visible_to_roles
field_config.editable_to_roles
defect_field_config.visible_to_roles
defect_field_config.editable_to_roles
```

따라서 기본 schema 변경 없이 UI 기능을 확장할 수 있습니다.

### Defect Field Config 적용 범위

Defect 쪽에서는 우선 아래 화면에 반영합니다.

```text
Defect Raw Data column order / visibility
Defect Detail field display / required indication
Defect Export column order / display name
```

추가로 Import parser의 원본 header와 field mapping을 `defect_field_config.original_header`, `source_origin` 기준으로 표시할 수 있게 합니다.

### 수정 대상

```text
src/pages/AdminPage.tsx
src/hooks/useDefectFieldConfig.ts
src/pages/DefectRawDataPage.tsx
src/pages/DefectDetailPage.tsx
src/pages/DefectExportPage.tsx
```

---

## 6. 구현 순서

```text
Phase 1: 공통 유틸 / Config 기반 정리
- defect progress aggregation utility 추가
- defect chart aggregation utility 추가
- defect field config hook 추가
- defect export utility 추가

Phase 2: 화면 구현
- Defect Progress Matrix 화면 구현
- Dashboard / Progress chart 추가
- Raw Data의 Subcontractor Issue No 표시/검색 강화
- Detail의 Subcontractor Issue Source 관리 추가

Phase 3: Export 고도화
- Advanced Export filter UI 구현
- Field Config 기반 column export 구현
- Summary / Export Info sheet 추가

Phase 4: Admin Field Config 고도화
- T&C / Defect field config sub-tab 분리
- Display Name inline edit
- Role visibility / editability 설정
- Defect 화면들에 설정 반영

Phase 5: 검증
- Import → Progress Matrix → Chart → Export 흐름 검증
- Field Config 변경 후 Raw Data / Detail / Export 반영 확인
```

---

## 7. DB 변경 여부

이번 5개 기능은 우선 기존 schema로 구현 가능합니다.

이미 존재하는 주요 컬럼:

```text
defect_items.subcontractor_issue_no
defect_items.subcontractor_issue_source
defect_items.planned_date
defect_items.target_date
defect_items.closed_date
defect_items.actual_progress_pct
defect_items.closure_status
defect_daily_snapshots.snapshot_date
defect_field_config.visible_to_roles
defect_field_config.editable_to_roles
```

따라서 schema migration은 기본적으로 필요 없습니다.

다만 구현 중 아래 요구가 추가되면 DB 확장이 필요할 수 있습니다.

```text
- 사용자별 export preset 저장
- field config 변경 이력 저장
- subcontractor issue no 별도 master/history 테이블
- dashboard filter preset 저장
```

이번 범위에서는 우선 DB 변경 없이 구현합니다.

---

## 8. 검증 항목

```text
1. /defects/progress에서 Progress Matrix가 표시됨
2. Matrix group by / bucket / date range 변경이 동작함
3. Matrix cell 클릭 시 Raw Data 필터로 이동 가능함
4. Daily chart가 날짜별 planned / closed count를 표시함
5. Cumulative chart가 누적 planned / closed / open trend를 표시함
6. Raw Data에서 Subcontractor Issue No가 표시되고 검색됨
7. Detail에서 Subcontractor Issue No / Source를 수정할 수 있음
8. 수정 내역이 defect_change_log에 기록됨
9. Advanced Export에서 필터 조건이 적용됨
10. Export Excel에 Defects / Summary / Export Info sheet가 생성됨
11. Export column명이 defect_field_config display_name을 반영함
12. Admin Field Config에서 T&C / Defect 설정을 분리 관리할 수 있음
13. Defect field visibility/order가 Raw Data / Detail / Export에 반영됨
14. 기존 Import / Master 자동 등록 / 유사명 확인 Dialog 기능이 유지됨
```
