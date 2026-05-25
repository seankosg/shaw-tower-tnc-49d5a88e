## 원인 분석

**Subtask 자동 연결 로직은 이미 추가되어 있음**(`parseSubtaskItemNo` + 2nd-pass parent link, `src/lib/punch-excel-utils.ts` lines 94/297-305/523-598). 하지만 실제 import에서 `3.5`, `4.1`~`4.4`가 flat row로 들어갔습니다.

DB 확인 결과:
- `3.1`~`3.4` (07:08~07:24 import) → `parent_id` 있음 (이전 Excel에 `Parent Item No` 열이 있었음)
- `3.5`, `4.1`~`4.4` (07:55 import) → `parent_id` 없음 (자동 추출이 동작하지 않은 것처럼 보임)

**근본 원인**: 파서가 **파일 선택 시점**에 동작하고 그 결과를 메모리에 저장(`item.parsed`)한 뒤, 사용자가 나중에 "Import" 버튼을 눌러도 그 캐시된 row를 사용합니다 (`PunchImportPage.tsx` line 100, 163). 사용자가 코드 배포 **이전**에 파일을 큐에 추가했다면 구버전 파서로 파싱된 row가 그대로 upsert에 전달되어 `parent_item_no`가 비어있게 됩니다.

또한 향후에도 다음 케이스에서 동일 문제가 재발할 수 있음:
- 외부에서 만든 row 데이터를 `upsertPunchRows`에 직접 전달
- 파서가 어떤 이유로 `parent_item_no`를 채우지 못한 경우 (예: 사용자가 Excel에 빈 Parent Item No 컬럼을 두었을 때 truthy 체크 실패)

## 수정 방안

`upsertPunchRows` 안에서 한 번 더 **방어적으로 자동 추출**을 수행합니다. 파서 결과에 의존하지 않고, item_no 자체에서 직접 parent를 derive.

### 코드 변경 (`src/lib/punch-excel-utils.ts`)

`upsertPunchRows` 도입부 (현재 lines 336-345)에서:

```ts
for (const r of rows) {
  let pin = (r.values as any).parent_item_no;
  // Defensive: if explicit parent missing, derive from item_no (handles stale parses).
  if (!pin && r.values.item_no) {
    const { itemNo, parentItemNo } = parseSubtaskItemNo(r.values.item_no);
    if (parentItemNo) {
      r.values.item_no = itemNo;   // normalize "3_1" → "3.1" too
      pin = parentItemNo;
    }
  }
  if (pin && r.values.item_no) {
    parentRefByItemNo.set(r.values.item_no, String(pin).trim());
  }
  delete (r.values as any).parent_item_no;
  delete (r.values as any).manual_override_fields;
  delete (r.values as any).is_summary;
}
```

이러면:
1. 파서가 이미 채운 경우: 기존 경로 유지
2. 파서가 누락한 경우 (구 캐시 / 외부 호출): item_no에서 자동 derive
3. `_` separator 정규화도 보장 (`3_1` → `3.1`)

### 검증

수정 후 사용자가 동일 파일을 **다시 import**하면 (이번엔 새 코드로 파싱 + 방어 로직), `3.5`, `4.1`~`4.4`가 parent `3`, `4`에 자동 연결되고 두 parent는 `is_summary=true`로 promote됩니다.

### 영향 범위

- 변경 파일: `src/lib/punch-excel-utils.ts` 1개 (upsertPunchRows 함수 도입부 ~7줄)
- DB 스키마/RLS 변경 없음
- 기존 정상 케이스는 동작 동일