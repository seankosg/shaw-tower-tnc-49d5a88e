## Goal
Defect Import의 ColumnSelectDialog에서 기존 "Aconex only" / "HDEC only" 빠른 필터 버튼을 제거하고, Defect 워크플로에 맞춘 3개의 프리셋 버튼으로 교체한다.

- **New Upload** — 모든 컬럼 선택 (excluded 비움). 신규 등록용.
- **Update from Aconex** — 다음 컬럼만 기본 선택:
  - Issue Number (`issue_no`)
  - Status (`status`)
  - Closed on / Date Closed (`actual_closure_date`)
  - Field - Verified by HDEC (헤더 매칭, 미매핑 커스텀 컬럼)
  - Comments (`aconex_comments`)
- **HDEC's Update** — 다음 컬럼만 기본 선택:
  - Issue Number (`issue_no`)
  - Team (`team`)
  - Subcontractor (`subcontractor_name`)
  - Sub-Sub (`subsub_name`)
  - HDEC PIC (`hdec_pic_name`)
  - HDEC ENG (`hdec_eng_name`)
  - Planned Start / Completion / Closure Date (`planned_start_date`, `planned_completion_date`, `planned_closure_date`)
  - Actual Start / Completion / Closure Date (`actual_start_date`, `actual_completion_date`, `actual_closure_date`)

버튼 클릭 시 = 프리셋이 baseline으로 적용되고(나머지는 excluded), 이후 사용자가 체크박스로 자유롭게 추가/해제 가능. (기존 Select all / Deselect all / Reset 버튼은 유지)

## UI placement
현재 버튼 영역(`Select all`, `Deselect all`, …, `Reset`) 의 좌측에 위치한 "Aconex only / HDEC only" 두 개 버튼을 제거하고, 같은 위치에 3개의 프리셋 버튼을 추가한다. 색상은 의미론적 구분을 위해:
- New Upload — neutral outline
- Update from Aconex — emerald (Aconex 컬러)
- HDEC's Update — blue (HDEC 컬러)

## Technical changes

1. **`src/components/import/ColumnSelectDialog.tsx`**
   - 제거: `selectByOrigin`, `showOriginQuickFilters` prop, "Aconex only" / "HDEC only" 버튼.
   - 추가: 새로운 옵셔널 prop `presets?: Array<{ id: string; label: string; className?: string; matchedHeaders: string[] }>` — 부모(DefectColumnSelect)에서 헤더 단위 프리셋을 주입.
   - 헤더 표시 영역에 `presets`가 있으면 각 프리셋을 버튼으로 렌더, 클릭 시 `setExcluded(new Set(headers.filter(h => !preset.matchedHeaders.includes(h))))` 적용.
   - `getSourceLabel` / `getSourceOrigin` 등 origin 배지 로직은 그대로 유지(기존 mapping badge용).

2. **`src/components/import/DefectColumnSelect.tsx`**
   - `useMemo`로 3개 프리셋의 `matchedHeaders`를 계산.
     - field name 기반 매칭(`toFieldName(header)`).
     - "Field - Verified by HDEC"는 alias map에 없으므로, 미매핑 커스텀 컬럼은 헤더 문자열 정규화(소문자/공백/하이픈 제거) 후 substring 포함 매칭으로 보조 식별: `verified` AND (`hdec` OR `field`).
   - `<ColumnSelectDialog ... presets={presets}>` 로 전달, 기존 `showOriginQuickFilters` prop 제거.

3. **다른 호출처 점검** — `DocsColumnSelect.tsx` 등은 origin 빠른 필터를 사용하지 않으므로 영향 없음(소품 자체가 옵셔널이라 무영향).

## Out of scope
- 컬럼 선택 후의 import 동작/검증 로직 변경 없음.
- DB / Field Config / 권한 로직 변경 없음.
- ABD/OMM/Warranty 프리셋은 이번 작업 범위 아님.
