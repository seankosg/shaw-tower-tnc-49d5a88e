## Plan: Rename "Actual Test" → "Official Test" in Report Generation

### Scope
리포트 생성 관련 3개 파일에서 T2 단계를 설명할 때 사용하는 용어를 "Actual Test"에서 "Official Test"로 일괄 변경합니다. 다른 코드는 수정하지 않습니다.

### Changes

1. **`src/lib/report-builder.ts`**
   - `renderTncMd()` 함수 내에서:
     - `"Actual Test (T2)"` → `"Official Test (T2)"` (라인 218)
     - `"Actual Test (T2)"` → `"Official Test (T2)"` (라인 227)
   - `renderTncMd()` 함수 내 progress 테이블 헤더 설명에서도 동일하게 교체:
     - `"Stages: Pre-Test, Actual Test, Test Report"` → `"Stages: Pre-Test, Official Test, Test Report"` (라인 223)

2. **`src/pages/admin/ReportTab.tsx`**
   - `DEFAULT_SYSTEM_PROMPT` 상수 내에서:
     - `"T2 as 'Actual Test'"` → `"T2 as 'Official Test'"` (라인 44)

3. **`supabase/functions/report-llm/index.ts`**
   - `sys` 변수 기본값 문자열 내에서:
     - `"T2 as 'Actual Test'"` → `"T2 as 'Official Test'"` (라인 18)

### Verification
- 변경 후 전체 빌드가 통과하는지 확인합니다.
- `rg "Actual Test" src/lib/report-builder.ts src/pages/admin/ReportTab.tsx supabase/functions/report-llm/index.ts` 로 잔여 매치가 없는지 확인합니다.

### No other changes
색상, 로직, DB 스키마, UI 레이아웃 등 다른 모든 코드는 그대로 유지됩니다.