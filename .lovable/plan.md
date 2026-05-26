## 목표

Punch Raw Data 페이지에서 Summary Task와 Subtask 간의 계층 작업 흐름을 강화합니다.

1. Subtask의 비어있는 메타데이터 필드를 부모 Summary 값으로 채우는 일회성 마이그레이션
2. Summary / Subtask 별도 필터
3. Summary 행에서 자식 Subtask들을 펼침/접기
4. 테이블 상단에 "전체 펴기 / 전체 접기" 버튼

---

## 1. 일회성 마이그레이션 (DB)

`punch_items`에서 `parent_id IS NOT NULL`(=Subtask)이고 해당 필드가 `NULL` 또는 빈 문자열인 경우, 부모 Summary 행의 값으로 채웁니다.

대상 필드 (스케줄/진척/게이트 상태는 Subtask 고유이므로 제외):

- classification: `category1`, `category2`, `category3`, `critical_level`, `work_type`, `main_trade`, `sub_trade`
- identity: `location`, `level`
- people: `team`, `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
- meta: `remarks`

조건 요약: `UPDATE punch_items child SET <field> = parent.<field> FROM punch_items parent WHERE child.parent_id = parent.id AND parent.is_summary AND (child.<field> IS NULL OR child.<field> = '')`

영향 받는 행 예상치(현재 Subtask 416건 중): subcontractor ~361, location ~360, team ~358 등.

`updated_at` 트리거는 그대로 동작하므로 클라이언트 캐시는 다음 incremental refresh로 자동 동기화됩니다.

---

## 2. Summary / Subtask 필터

Field Registry의 `is_summary` 컬럼을 이미 노출 가능합니다. 표시 라벨을 사람이 읽을 수 있도록 변환:

- `is_summary = true` → "Summary"
- `parent_id IS NOT NULL` → "Subtask"
- 나머지 → "Standalone"

구현:

- 가상 컬럼 `row_type` (display only) 추가 → 값은 위 3가지
- `ColumnFilterDropdown`의 multi-select로 동작
- "Active column filters" 칩에도 자연스럽게 표시
- 기존 `is_summary` 컬럼은 그대로 두되 기본 숨김 처리

---

## 3. Summary 펼침/접기

상태: 페이지 레벨 `Set<string>` (collapsed summary IDs) — `useState`로 관리.

- Summary 행의 Item No 셀 좌측 아이콘을 클릭 가능한 토글 버튼으로 변경
  - 펼침: `ChevronDown` / 접힘: `ChevronRight` (기존 `Layers` 아이콘은 제거하거나 토글과 병기)
  - `e.stopPropagation()`으로 행 클릭(상세 이동) 차단
- `orderedRows` 계산 단계에서, 부모가 `collapsed` 집합에 있으면 그 자식 Subtask들을 결과에서 제거
- 정렬이 기본 정렬이 아닐 때(사용자가 컬럼 정렬 적용 시)에는 계층 구조가 의미 없으므로 토글/버튼을 비활성화하거나 숨김
- 행이 숨겨질 때 `rowSelection`은 그대로 유지 (다시 펼치면 복원)

상태는 페이지 메모리에만 — 새로고침/페이지 이탈 시 리셋(localStorage 저장은 불필요, 단순화).

---

## 4. 전체 펴기 / 전체 접기 버튼

위치: 검색 바와 같은 줄 (1065~1084 라인 영역), `filteredRowCount` 표기 옆.

```
[Search] [N records] [Expand all] [Collapse all] [Clear sort]
```

- "Collapse all": 현재 보이는 Summary 모두 collapsed에 추가
- "Expand all": collapsed 집합 비우기
- 기본 정렬이 아니면 disabled

---

## 기술 정리

- DB 변경: `supabase--migration` (UPDATE만, 스키마 변경 없음). 마이그레이션 도구로 실행하므로 사용자 승인 후 자동 수행.
- 코드 변경:
  - `src/pages/PunchRawDataPage.tsx`: `collapsedSummaries` 상태, `orderedRows` 필터링, 토글 핸들러, 상단 버튼, row_type 가상 컬럼/필터
  - `src/lib/punch-field-registry.ts`: (선택) `row_type` 가상 필드 정의 추가 또는 페이지 내부에서만 처리
- Field Config 마이그레이션 없음 (가상 컬럼만 추가)

마이그레이션 도구는 본 플랜 승인 후 첫 단계로 호출합니다.
