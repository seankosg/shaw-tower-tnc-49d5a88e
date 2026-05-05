## 목적

Field Config에서 비활성화 → 활성화로 토글된 필드가 Raw Data 표에 자동으로 컬럼으로 나타나고, 필드 속성에 따라 적절한 필터(text / date-range / multi-select / progress)가 자동 부착되도록 한다. 우선 T&C(SubtestList)와 Defect(DefectRawDataPage) 두 페이지에 구현.

---

## 현재 구조 진단

### T&C (SubtestList.tsx)
- `field_config` 41행 모두에 대해 컬럼이 **하드코딩으로 이미 존재**하고 각 컬럼에 `filterFn` + `meta.filterType`이 부착되어 있음.
- `columnVisibility`가 `isFieldVisible(fieldName)` 결과를 그대로 반영하므로, Field Config에서 `is_enabled=true`로 바꾸면 컬럼이 즉시 노출되고 헤더 필터 아이콘도 자동 동작함.
- → **T&C는 사실상 이미 자동 노출되는 구조**. 필요한 작업은 "혹시 누락된 필드"만 점검 (현재는 누락 없음) + 향후 새 필드 추가 시 가이드.

### Defect (DefectRawDataPage.tsx)
- 컬럼은 `DEFECT_RAW_FIELDS`(line 55)라는 **하드코딩 배열**을 map하여 생성.
- `defect_field_config`에는 `payload_*` 14개 + `_meta_*` 4개 + 일반 필드들이 있는데, `DEFECT_RAW_FIELDS`에는 **`payload_*` 필드가 전혀 포함돼 있지 않음**.
- 따라서 Field Config에서 `payload_doc_title` 같은 필드를 enable로 토글해도 Raw Data 표에는 컬럼이 생기지 않음.
- 필터 분류는 `TEXT_FILTER_FIELDS` / `DATE_FILTER_FIELDS` / `PROGRESS_FIELDS` Set으로 관리.

---

## 해결 전략

`defect_field_config` 행 자체를 **컬럼 생성의 소스**로 삼는다. `DEFECT_RAW_FIELDS`는 "코어/구조적 필드" 리스트로 유지하고, 그 외의 활성화된 config 필드(특히 `payload_*`)를 동적으로 컬럼으로 추가한다.

T&C는 이미 동작하므로 검증 + 작은 보강만 한다.

---

## 작업 항목

### 1. 공통 유틸 신설: `src/lib/field-filter-type.ts`
필드명에서 자동으로 filter 타입을 추론하는 헬퍼.
```text
inferFilterType(fieldName, originalHeader?) → 'date-range' | 'multi-select' | 'progress' | 'text'
```
규칙(우선순위 순):
1. 명시 매핑 테이블(이미 알려진 필드)
2. `_date` / `_at` 으로 끝나거나 `original_header`에 'date'/'on' 포함 → `date-range`
3. `_pct` 로 끝남 → `progress`
4. `status` / `team` / `type` / `priority` / `source` / `level` 등 enum성 키워드 포함 → `multi-select`
5. 기본 → `text`

`multi-select` 시 옵션은 현재 데이터에서 unique 값을 추출해서 채움.

### 2. Defect Raw Data 동적 컬럼 추가
`DefectRawDataPage.tsx`에서:
- `defect_field_config` 중 `is_enabled=true` 인 행 중에서 `DEFECT_RAW_FIELDS`/`META_FIELD_NAMES`에 **이미 들어있지 않은** 필드(주로 `payload_*`)를 추출.
- 각 필드에 대해 `accessorFn: (row) => row.raw_payload?.[original_header ?? field_name]`로 컬럼 생성.
- `filterFn`은 `inferFilterType` 결과에 따라 부착.
- `cell`은 날짜면 `formatDdMmm`, 그 외 텍스트.
- `columnVisibility`도 동적 컬럼 포함하도록 일반화: 하드코딩된 `DEFECT_RAW_FIELDS` 루프 대신 "table.getAllColumns()" 기준으로 동작하게 수정.
- `columnOrder`는 `defect_field_config.sort_order` 따라 결정.

### 3. T&C 보강
- 현재 누락 필드 없음을 확인했지만, 향후 `field_config`에 새 필드를 추가했을 때 컬럼이 자동 생성되도록 동일 로직 추가:
  - `field_config` 행 중 SubtestList의 하드코딩 컬럼에 없는 필드가 있으면 동적 컬럼 생성.
  - 데이터 소스: `SubtestRow`의 직접 컬럼. 없는 필드는 빈 값 표시.
- 이번엔 안전을 위해 **경고 로그만 남기고**, 실제 동적 컬럼 생성은 Defect와 동일하게 활성화. (현재는 41행 모두 매핑되어 있으므로 동작 변화 없음.)

### 4. UI 일관성
- 기존 헤더 필터 아이콘(`ColumnFilterDropdown`)은 `meta.filterType`을 읽으므로 **수정 불필요**.
- 동적으로 추가된 컬럼도 동일 헤더 UI / 칩(`buildColumnFilterChips`) / Clear 동작이 자동으로 적용됨.

### 5. 검증
- Defect Field Config에서 `payload_doc_title`을 enable → Raw Data에 컬럼 등장 → 헤더에서 텍스트 필터 동작 확인.
- `payload_due_date`를 enable → date-range 필터로 동작 확인.
- T&C Field Config에서 `mos_sequence` 같이 기존에 hidden이던 필드 toggle → 컬럼 표시/필터 동작 확인.

---

## 변경 파일 (예상)
- `src/lib/field-filter-type.ts` (신규)
- `src/pages/DefectRawDataPage.tsx`
- `src/pages/SubtestList.tsx`

DB 변경 없음. 다른 페이지(Docs 등)는 이번 범위 밖.
