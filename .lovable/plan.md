## 목표
Punch Raw Data의 `Item No` 컬럼을 두 개로 분리합니다.
- **Summary No**: 부모(요약) 번호. 예) `67`
- **Subtask No**: Summary 행은 `S`로 표시, Subtask 행은 자기 자신의 전체 값(예: `67.1`)

기존 `item_no`는 호환을 위해 유지합니다(읽기/조회/dedup 인덱스가 의존).

## 변경 사항

### 1) DB 마이그레이션 (1회)
- `punch_items`에 두 컬럼 추가
  - `summary_no text`
  - `subtask_no text`
- 일회 백필
  - Summary 행 (`is_summary = true`)
    - `summary_no = item_no`
    - `subtask_no = 'S'`
  - Subtask 행 (`is_summary = false`)
    - `summary_no = parent.item_no` (parent_id JOIN, 없으면 `split_part(item_no,'.',1)`로 fallback)
    - `subtask_no = item_no`
- 트리거 `punch_items_sync_split_nos`
  - INSERT/UPDATE 시 `item_no`/`is_summary`/`parent_id` 변경되면 위 규칙으로 `summary_no`/`subtask_no` 재계산
  - 이렇게 하면 기존 코드(여전히 `item_no`만 쓰는 경로)가 깨지지 않음
- 인덱스: `idx_punch_items_summary_no(project_id, summary_no) WHERE is_active`

### 2) `punch_field_config` 가상 필드 등록
- `summary_no`: display_name `Summary No`, sort_order 1, source_origin `system`
- `subtask_no`: display_name `Subtask No`, sort_order 2, source_origin `system`
- 기존 `item_no` 필드는 기본 숨김(`is_visible=false`)으로 전환(설정에서 다시 켤 수 있게 유지)

### 3) `src/lib/punch-field-registry.ts`
- `summary_no`, `subtask_no` 두 필드 등록
  - aliases: `summary_no` ← `['summaryno','summaryitemno','parentno','parent','itemno','no','sn','sno']`
  - aliases: `subtask_no` ← `['subtaskno','subtask','subno','subitemno']`
  - group `identity`, dataType `text`
- 기존 `item_no` 등록은 유지(legacy), `parent_item_no`는 유지하되 import에서 우선순위 낮춤

### 4) `src/pages/PunchRawDataPage.tsx`
- `renderCell`에 `summary_no`, `subtask_no` case 추가
  - 값은 row 자체에서 직접 읽음(트리거가 채워줌)
  - Summary 행 `subtask_no`는 `S` 배지 형태(muted)
- `allFieldIds`/컬럼 빌더에 두 필드 추가, 기본 컬럼 순서에서 Item No 자리에 배치
- 정렬: `summary_no`는 `compareItemNo` 재사용, `subtask_no`는 동일 비교(또는 자연순)

### 5) Import 매핑 (`src/lib/punch-excel-utils.ts` + parser)
신규 입력 모델: 엑셀이 다음 중 어떤 조합으로 와도 처리
- (A) 신규 포맷: `Summary No` + `Subtask No`
  - `subtask_no = 'S'` → Summary 행으로 처리, `item_no = summary_no`
  - `subtask_no` ≠ `'S'` → Subtask 행, `item_no = subtask_no`, `parent_item_no = summary_no`
- (B) 레거시 포맷: `Item No`만 존재 → 기존 `parseSubtaskItemNo` 로직 유지(점 표기 → 부모/자식 분해)
- 우선순위: A가 있으면 A를 사용, 없으면 B로 폴백
- dedup 키는 그대로 `item_no` 사용(트리거가 split 컬럼을 동기화)

### 6) Export
- 기존 Item No 컬럼 자리에 두 컬럼(`Summary No`, `Subtask No`) 출력
- Re-import 라운드트립 호환 위해 둘 다 헤더로 기록

### 7) 영향 범위 / 제외
- Dashboard/Detail 페이지 화면 표시는 이번 작업에서 그대로(필요 시 후속 작업)
- RLS/권한 변경 없음
- `item_no`/`parent_item_no` 의존 로직(증분 import dedup, parent 연결)은 변경 없음 — 트리거가 동기화

## 기술 디테일

### 트리거 의사코드
```text
BEFORE INSERT OR UPDATE OF item_no, is_summary, parent_id
  IF is_summary THEN
    summary_no := item_no; subtask_no := 'S';
  ELSE
    summary_no := COALESCE(
      (SELECT item_no FROM punch_items WHERE id = NEW.parent_id),
      split_part(item_no, '.', 1)
    );
    subtask_no := item_no;
  END IF;
```

### 백필 SQL (개념)
```sql
UPDATE punch_items SET summary_no = item_no, subtask_no = 'S' WHERE is_summary;
UPDATE punch_items c SET
  summary_no = COALESCE(p.item_no, split_part(c.item_no,'.',1)),
  subtask_no = c.item_no
FROM punch_items p WHERE p.id = c.parent_id AND NOT c.is_summary;
UPDATE punch_items SET
  summary_no = split_part(item_no,'.',1), subtask_no = item_no
WHERE NOT is_summary AND summary_no IS NULL;
```

## 산출물
1. supabase migration (컬럼 추가 + 백필 + 트리거 + 인덱스)
2. `punch_field_config` 데이터 변경(insert 툴)
3. `src/lib/punch-field-registry.ts` 수정
4. `src/lib/punch-excel-utils.ts` (+ 관련 parser) 매핑 로직 수정
5. `src/pages/PunchRawDataPage.tsx` 컬럼 렌더링/순서 반영
6. `src/lib/punch-excel-export.ts` 등 export에 두 컬럼 반영