

# 테이블 헤더/필터 틀고정 + 정렬/다중필터 개선

## 현재 문제
- `Table` 컴포넌트가 자체적으로 `overflow-auto` div를 감싸고 있어 sticky header가 제대로 동작하지 않음 (이중 스크롤 컨테이너)
- Select 필터가 단일 선택만 지원

## 변경 사항

### 1. Table 컴포넌트 수정 (`src/components/ui/table.tsx`)
- `Table`의 wrapper div에서 `overflow-auto` 제거 → 외부 스크롤 컨테이너만 사용하도록 변경

### 2. SubtestList 테이블 구조 변경 (`src/pages/SubtestList.tsx`)
- 외부 div를 스크롤 컨테이너로 사용하고, `<thead>`를 `sticky top-0`으로 고정
- 헤더 행 + 필터 행 모두 sticky 유지 (헤더 bg-background로 겹침 방지)
- Select 필터를 **다중 선택** 지원으로 변경:
  - Radix Select → Popover + Checkbox 기반 다중 선택 UI
  - 선택된 값 목록으로 필터링 (여러 상태/시스템 동시 필터)
- 정렬: 이미 구현되어 있음 (클릭 시 asc/desc 토글 + 화살표 표시) — 유지

### 3. 다중 Select 필터 (`ColumnFilter` 컴포넌트 개선)
- `type === 'multi-select'`일 때 Popover + Checkbox 목록 렌더링
- 선택된 항목 수 표시 (예: "2 selected")
- `filterFn`을 배열 기반으로 변경: `filterValue`가 배열이면 `includes` 체크

## 수정 파일
| 파일 | 작업 |
|------|------|
| `src/components/ui/table.tsx` | Table wrapper에서 overflow-auto 제거 |
| `src/pages/SubtestList.tsx` | sticky 헤더 구조 수정, 다중 선택 필터 구현 |

