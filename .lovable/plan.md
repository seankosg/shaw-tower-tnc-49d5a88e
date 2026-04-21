

## Raw Data 컬럼 필터 개선 — 드롭다운 메뉴 + Empty 필터

### 개요
컬럼 헤더 클릭 시 **DropdownMenu**가 열리고, 해당 컬럼 유형에 맞는 필터 UI를 제공합니다. 모든 필터에 **(Empty)** 옵션을 포함하여 빈 값 추출이 가능합니다.

### 필터 유형별 적용 컬럼

| 필터 유형 | 컬럼 | UI |
|---|---|---|
| **Multi-select** (고정 옵션) | System, T1/T2 Status, Source | 드롭다운 → 체크박스 목록 + (Empty) |
| **Multi-select** (자동 옵션) | Subcontractor, Sub-Sub, HDEC PIC | 드롭다운 → 데이터에서 추출한 체크박스 + (Empty) |
| **Date range** | T1/T2 Planned, T1/T2 Actual, Pred Planned/Actual | 드롭다운 → From/To 날짜 입력 + Empty only 체크 |
| **Text** | Item No, Subtest ID, MOS Code, Equipment, Description, Predecessor | 드롭다운 → 텍스트 입력 + Empty only 체크 |

### 구현 상세

#### 1. ColumnFilterDropdown 통합 컴포넌트

기존 인라인 `ColumnFilter`를 `DropdownMenu` 기반으로 교체합니다.

```text
[헤더 텍스트] [▼ 필터 아이콘]
     ┌──────────────────────┐
     │ ☐ (Empty)            │  ← multi-select
     │ ☐ Option A           │
     │ ☐ Option B           │
     │ ── Clear all ──      │
     └──────────────────────┘

     ┌──────────────────────┐
     │ From: [____]         │  ← date-range
     │ To:   [____]         │
     │ ☐ Empty only         │
     │ ── Clear ──          │
     └──────────────────────┘

     ┌──────────────────────┐
     │ [Search text____]    │  ← text
     │ ☐ Empty only         │
     │ ── Clear ──          │
     └──────────────────────┘
```

- 필터가 활성화된 컬럼은 헤더 아이콘 색상 변경 (예: `text-primary`)으로 시각적 피드백
- `DropdownMenuContent`에 `onClick={(e) => e.preventDefault()}` 처리하여 입력 중 메뉴 닫힘 방지

#### 2. 필터 함수 3종

**multiSelectFilterFn** (수정):
```typescript
// __EMPTY__ 값 지원 추가
const val = row.getValue(columnId);
const isEmpty = val == null || val === '';
if (filterValue.includes('__EMPTY__') && isEmpty) return true;
if (isEmpty) return false;
return filterValue.includes(val);
```

**dateRangeFilterFn** (신규):
```typescript
// { from?: string, to?: string, emptyOnly?: boolean }
if (emptyOnly) return val == null || val === '';
if (!from && !to) return true;
if (!val) return false;
if (from && val < from) return false;
if (to && val > to) return false;
return true;
```

**textFilterFn** (수정):
```typescript
// { text?: string, emptyOnly?: boolean } | string 호환
if (emptyOnly) return val == null || String(val).trim() === '';
return String(val).toLowerCase().includes(text.toLowerCase());
```

#### 3. 날짜 컬럼 필터 활성화

6개 날짜 컬럼에서 `enableColumnFilter: false` 제거, `filterFn: dateRangeFilterFn` + `meta: { filterType: 'date-range' }` 적용.

#### 4. Subcontractor / Sub-Sub / HDEC PIC → Multi-select 전환

`useMemo`로 데이터에서 고유값 추출하여 옵션 목록 자동 생성. `filterFn`을 `multiSelectFilterFn`으로 변경.

#### 5. 헤더 렌더링 변경

현재 헤더 아래 별도 행에 필터를 렌더링하는 방식에서, **헤더 셀 내부에 드롭다운 트리거 아이콘**을 배치하는 방식으로 변경합니다. 필터 행은 제거하여 테이블 공간을 절약합니다.

#### 6. localStorage 호환

날짜 필터 `{ from, to, emptyOnly }`, 텍스트 필터 `{ text, emptyOnly }` 모두 기존 JSON 직렬화와 호환됩니다.

### 수정 파일
- `src/pages/SubtestList.tsx` — 필터 함수, ColumnFilterDropdown 컴포넌트, 컬럼 정의, 헤더 렌더링

### 결과
- 컬럼 헤더의 필터 아이콘 클릭 → 드롭다운 메뉴로 필터 조건 설정
- 모든 컬럼에서 **(Empty)** 옵션으로 빈 값 행 추출 가능
- 날짜 컬럼 From~To 범위 필터 + Empty only
- 필터 활성 상태 시각적 표시
- 기존 필터 행 제거로 테이블 영역 확대

