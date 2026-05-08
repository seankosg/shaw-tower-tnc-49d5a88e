## Goal
Raw Data의 **Critical 컬럼 tick**을 즉시 저장하지 않고 **pending(예약)** 상태로만 표시. 한 행이라도 pending이 있으면 화면에 **"Register to Critical Issue Board"** 버튼이 나타나고, 클릭해야 실제 DB 저장. 이미 등록된 행을 untick하면 **pending unregister**로 처리, 같은 버튼에서 함께 반영.

적용 대상: `DefectRawDataPage` + `SubtestList` (둘 다 동일 패턴).

## Behavior

- 행의 현재 상태가 `is_critical = false`인데 tick → **pending register**.
- 행의 현재 상태가 `is_critical = true`인데 untick → **pending unregister**.
- pending 상태인 셀은 시각적으로 구분 (예: 노란/주황 ring + "·" 점 표시).
- 화면 하단(또는 BulkActionBar 근처) floating bar:
  - `N to register · M to unregister` 카운트 표시
  - **Apply Changes** 버튼 → 한 번의 round-trip(두 개 update — true/false)으로 DB 반영
  - **Discard** 버튼 → pending 모두 취소
- 다른 페이지로 이동/새로고침 시 pending은 사라짐(메모리 보관만).

## Changes

### 1. `DefectRawDataPage.tsx`
- 새 state: `const [criticalPending, setCriticalPending] = useState<Map<string, boolean>>(new Map())` — id → 의도된 새 값.
- `criticalColumn.cell`의 Checkbox `checked` 계산:
  ```ts
  const original = !!(row.original as any).is_critical;
  const pending = criticalPending.get(row.original.id);
  const checked = pending ?? original;
  const isPending = pending !== undefined && pending !== original;
  ```
- onCheckedChange: 더 이상 supabase update 호출하지 않고, `setCriticalPending` Map만 갱신. 새 값이 원본과 같아지면 Map에서 제거.
- 셀에 `isPending`이면 `ring-2 ring-amber-500/60 rounded` 등 표시.
- 새 컴포넌트/JSX: `criticalPending.size > 0`일 때 페이지 하단 sticky bar (BulkActionBar 위 또는 옆) — register/unregister 카운트 + Apply/Discard 버튼.
- Apply 핸들러:
  ```ts
  const toRegister = [...pending].filter(([id, v]) => v === true).map(([id]) => id);
  const toUnregister = [...pending].filter(([id, v]) => v === false).map(([id]) => id);
  // 두 개의 update in()
  // 성공 시 setItems로 로컬 반영, setCriticalPending(new Map()), toast
  ```

### 2. `SubtestList.tsx`
- 동일한 패턴으로 적용 (criticalColumn은 line 949 부근).

### 3. 공용 헬퍼 (선택)
- `src/components/raw-data/CriticalPendingBar.tsx` 새 파일로 추출 — props: `pendingMap`, `table: 'defect_items' | 'subtests'`, `onApplied`, `onDiscard`. 두 페이지에서 재사용.

### 4. BulkActionBar의 기존 "Register to Critical Issue Board" 버튼
- 그대로 유지 (선택(select) 체크박스로 다중 선택 후 일괄 등록은 별개 워크플로). 사용자 요청은 Critical 컬럼 tick의 동작 변경에 한정.

## Out of scope
- pending 상태의 영속화(localStorage 등)
- Critical 외 다른 컬럼의 inline edit 동작
- Bulk select 워크플로 변경
