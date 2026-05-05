## 목적

T&C(SubtestList), Defect(DefectRawDataPage), Docs(DocsRawDataPage) 세 모듈 Raw Data의 모든 컬럼 헤더 필터(Text / Date-range / Multi-select)에 **Select all** + **Clear all** 두 액션을 통일된 UI로 표시.

- Multi-select: 두 액션 모두 정상 동작 (이미 구현됨, 변경 없음)
- Text / Date-range: Select all은 비활성(회색·hover 없음)으로 표시, Clear all은 현재 "Clear" 버튼을 라벨 변경 후 동일 위치(상단 바)로 이동

---

## 현재 상태 점검

| 페이지 | Multi-select | Text | Date-range |
|---|---|---|---|
| SubtestList.tsx | Select all + Clear all (✓) | "Clear"만 (하단) | "Clear"만 (하단) |
| DefectRawDataPage.tsx | Select all + Clear all (✓) | "Clear"만 (하단) | "Clear"만 (하단) |
| DocsRawDataPage.tsx | Select all + Clear all (✓) | "Clear"만 (하단) | "Clear"만 (하단) |

---

## 변경 내용

세 페이지의 `TextFilterDropdown`과 `DateRangeDropdown` 각각에 대해:

1. PopoverContent 최상단에 다음 행 추가:
   ```
   [Select all (회색·disabled)]  [Clear all]
   ```
   - 스타일은 기존 MultiSelectDropdown의 헤더 행과 동일 (`text-[11px]`, `gap-2`, `px-1`).
   - Select all은 `disabled` 속성 + `text-muted-foreground/40 cursor-not-allowed`, `title="Not applicable for {text|date} filters"`.
   - Clear all은 `column.setFilterValue(undefined)` 호출.

2. 기존 하단의 "Clear" 단일 버튼 제거 (상단 Clear all로 일원화).

3. 동작 변경 없음, 시각적 통일성만 확보.

---

## 변경 파일
- `src/pages/SubtestList.tsx` — TextFilterDropdown, DateRangeDropdown
- `src/pages/DefectRawDataPage.tsx` — TextFilterDropdown, DateRangeDropdown
- `src/pages/docs/DocsRawDataPage.tsx` — TextFilterDropdown, DateRangeDropdown

DB 변경 없음. ScheduleRevisionPage는 사용자가 명시한 "Raw Data" 범위 밖이므로 제외.
