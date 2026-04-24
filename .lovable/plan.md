

## Defect Raw Data 컬럼을 Field Config 와 동기화

### 문제

```text
Admin → Field Config (defect_field_config) 의 필드:
  planned_start_date, planned_completion_date, planned_closure_date
  actual_start_date, actual_completion_date, actual_closure_date
  area_raw, planned_progress_pct, completion_status, classified_at
  remarks, hdec_comments, classification_source ...

DefectRawDataPage 의 하드코드 (DEFECT_RAW_FIELDS):
  planned_date, target_date, actual_date, closed_date  ← DB 에 존재하지 않는 옛 이름
  area_raw / planned_progress_pct / completion_status / classified_at  ← 누락

결과:
  - Admin 에서 토글한 일정 컬럼이 Raw Data 에 반영되지 않음
  - DB 에 없는 4개 필드가 "—" 만 표시됨
  - 일부 활성 필드는 아예 표에 안 보임
```

### 변경 내용

**파일: `src/pages/DefectRawDataPage.tsx`**

**1. `DEFECT_RAW_FIELDS` 재정의 — Field Config 의 모든 필드를 포함**

옛 4개 (`planned_date`, `target_date`, `actual_date`, `closed_date`) 제거 후 다음으로 교체:
```text
'issue_no',
'subcontractor_issue_no', 'subcontractor_issue_source',
'closure_status', 'status', 'completion_status',
'team',
'planned_progress_pct', 'actual_progress_pct',
'area_type', 'area_level', 'area_location', 'area_raw',
'main_trade', 'sub_trade', 'work_type',
'classification_source', 'classified_at', 'trade_detail',
'description', 'defect_type', 'priority',
'subcontractor_name', 'subsub_name', 'hdec_pic_name',
'planned_start_date', 'planned_completion_date', 'planned_closure_date',
'actual_start_date', 'actual_completion_date', 'actual_closure_date',
'remarks', 'hdec_comments',
'updated_at', 'created_at',
```

**2. `DATE_FILTER_FIELDS` 갱신**
```text
new Set([
  'planned_start_date', 'planned_completion_date', 'planned_closure_date',
  'actual_start_date', 'actual_completion_date', 'actual_closure_date',
  'classified_at', 'updated_at', 'created_at',
])
```

**3. `RAW_SEARCH_FIELDS` 정리**
- `planned_date/target_date/actual_date/closed_date` 제거 (검색 대상에서 빼기 — 어차피 없는 필드)
- 새 일정 필드는 텍스트 검색 대상이 아님 (날짜 필터로만 처리)

**4. `PROGRESS_FIELDS` 다중화**
- 현재 `PROGRESS_FIELD = 'actual_progress_pct'` 단일
- `PROGRESS_FIELDS = new Set(['actual_progress_pct', 'planned_progress_pct'])` 로 변경
- column 정의에서 두 필드 모두 progressFilterFn / 'text' meta 사용
- cell 렌더에서 두 필드 모두 `formatPct(value)` 사용

**5. `filteredBaseData` 의 URL 날짜 폴백 수정**
- 현재 `item.planned_completion_date ?? item.planned_start_date` 사용 중 — 이미 새 스키마와 일치하므로 그대로 OK

**6. URL `urlMap` 의 dateField 매핑 검증**
- `DefectExportPage`/`DefectProgressMatrix` 에서 `dateField` 로 `planned_completion_date` 등을 넘김 — 이미 `DATE_FILTER_FIELDS` 새 set 에 포함되어 자동 처리됨

**7. `sizeByField` 에 신규 일정/진행률 컬럼 width 추가**
```text
planned_start_date: 110, planned_completion_date: 110, planned_closure_date: 110,
actual_start_date: 110, actual_completion_date: 110, actual_closure_date: 110,
planned_progress_pct: 100, actual_progress_pct: 100,
completion_status: 130, area_raw: 180, classified_at: 130,
```

**8. cell 렌더에서 `completion_status` 도 `DefectStatusBadge` 사용** (status/closure_status 와 동일 패턴)

**9. 셀 렌더의 description-like truncate 목록에 `area_raw` 추가**

### 변경하지 않는 항목

- Field Config 자체 (DB / Admin UI) — 이미 정확함
- DefectRawTableView / 가상화 / 정렬 / localStorage 키 — 그대로
- 다른 페이지 (Detail / Progress / Export) — 이미 새 스키마 사용 중
- 컬럼 visibility 로직 (`isFieldVisible`) — 그대로 사용; 필드 이름만 일치시키면 자연스럽게 동작

### 검증

```text
1. Admin → Field Config 에서 "Planned Start Date" off → Raw Data 그 컬럼 사라짐
2. Admin 에서 "Remarks" 토글 → 즉시 반영
3. URL ?dateField=planned_completion_date&dateStart=...&dateEnd=... 진입 시 해당 컬럼 날짜 필터 칠해짐
4. DB 에 없는 planned_date/target_date/actual_date/closed_date 컬럼이 더이상 표에 없음
5. planned_progress_pct / actual_progress_pct 두 컬럼 모두 % 표시
6. completion_status 가 badge 로 표시
7. localStorage 에 저장된 옛 columnSizing 키(planned_date 등) 는 무시되고 신규 컬럼은 default size 사용
8. 정렬/필터/검색 정상 동작
```

