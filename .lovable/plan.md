# 자유 입력 필드를 Combobox(검색 + 자유 입력)로 전환

## 목적
DefectDetailPage 상세 편집에서 5개 자유 입력 필드를 **Combobox**로 바꿔, 기존 데이터에 이미 사용 중인 값을 풀다운에서 빠르게 선택할 수 있게 하면서 새 값도 자유롭게 입력 가능하도록 합니다.

## 적용 대상
DefectDetailPage(`src/pages/DefectDetailPage.tsx`)의 다음 5개 필드:
- Level (`area_level`)
- Location (`area_location`)
- Main Trade (`main_trade`)
- Sub Trade (`sub_trade`)
- Work Type (`work_type`)

(Subcontractor / HDEC PIC / Status 등은 이미 풀다운이라 변경 없음.)

## 동작 사양
- 입력창처럼 보이고, 포커스/클릭 시 풀다운이 열림.
- 풀다운 옵션은 **현재 프로젝트(`record.project_id`)** 의 `defect_items` 중 `is_active = true`인 row에서 해당 컬럼의 distinct 값(공백/널 제외, 알파벳 정렬).
- 검색어 입력 시 옵션 필터링(부분 일치, 대소문자 무시).
- 옵션에 없는 값을 입력해도 그대로 저장됨(자유 입력 허용).
- "Clear" 옵션으로 값 비우기.
- shadcn `Command` + `Popover` 조합 사용(프로젝트 내 기존 패턴과 일치).

## 데이터 로딩 전략
- 상세 페이지가 `record`를 로드한 이후, 한 번 `defect_items`에서 5개 컬럼만 `select`해서 클라이언트에서 distinct 계산 → 메모리에 보관.
- 쿼리: `select area_level, area_location, main_trade, sub_trade, work_type from defect_items where project_id = ? and is_active = true limit 5000`.
- 5개 옵션 리스트를 `useMemo`로 분리해 SuggestField에 전달.
- 같은 페이지 내 저장 후엔 옵션이 약간 stale일 수 있으나, 사용자가 방금 입력한 값은 자유 입력으로 항상 통과되므로 UX에 문제 없음.

## 구현 변경
1. **`src/components/ui/SuggestField.tsx`** (신규)
   - props: `label`, `value`, `options: string[]`, `onChange(value: string | null)`, `disabled`, `placeholder`.
   - Popover + Command(CommandInput / CommandList / CommandItem) + 자유 입력 fallback.
   - 입력값이 옵션에 없을 때 "Use \"<typed>\"" 항목 노출 → 선택 시 그 문자열 그대로 저장.

2. **`src/pages/DefectDetailPage.tsx`**
   - `record` 로드 직후 5개 컬럼 distinct 옵션 fetch (effect 추가).
   - 419~423 라인의 `<Field>` 5개를 `<SuggestField>`로 교체, 각 필드별 옵션 전달.
   - 기존 `Field` 컴포넌트는 다른 자유 입력에 그대로 사용.

3. **검증**: `bunx tsc --noEmit` 통과 확인.

## 영향 / 위험
- 저장 로직은 변경 없음(여전히 string 그대로 저장). 자동 상태 재계산 정책에도 영향 없음.
- Quick Update 페이지는 이번 범위 외(요청에 따름).
- DB 변경 없음, 마이그레이션 없음.
