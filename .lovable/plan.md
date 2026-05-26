## 목표

Punch Raw Data에서 **Subtask가 없는 Task(=Standalone)** 를 **Summary로 동일하게 취급**한다.
즉 `parent_id IS NULL`인 모든 행은 `is_summary = true`가 되도록 정규화한다.

현재 DB 상태:
- Summary rows: 76
- Standalone rows (parent_id=null, is_summary=false): **92** ← 이번 마이그레이션 대상
- Subtask rows: 416

---

## 구현 계획

### 1) 일회성 데이터 마이그레이션

```sql
UPDATE public.punch_items
SET is_summary = true
WHERE parent_id IS NULL
  AND (is_summary IS NULL OR is_summary = false);
```

### 2) DB 트리거 — 향후 일관성 보장

`is_summary`를 `parent_id` 기준으로 자동 동기화하는 BEFORE INSERT/UPDATE 트리거를 추가한다.

```sql
CREATE OR REPLACE FUNCTION public.punch_items_sync_is_summary()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_summary := (NEW.parent_id IS NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS punch_items_sync_is_summary ON public.punch_items;
CREATE TRIGGER punch_items_sync_is_summary
BEFORE INSERT OR UPDATE OF parent_id
ON public.punch_items
FOR EACH ROW
EXECUTE FUNCTION public.punch_items_sync_is_summary();
```

- 새 행 INSERT 시 parent_id가 없으면 자동 Summary
- 자식 행이 parent_id 해제(detach)되면 자동 Summary로 승격
- 자식이 새로 붙으면 parent_id 변경 트리거는 자식 쪽에서만 발화(부모 행은 별도 처리 불필요 — 이미 parent_id NULL이므로 Summary 유지)

### 3) UI / 코드 영향

코드 변경은 **없음**. 기존 로직이 그대로 동작:
- `renderCell` (summary_no): `is_summary=true` → 토글 + bold + `M` override badge
- `subtask_no` 컬럼: `is_summary=true` → `S` 배지 (이전 대화에서 요청된 단독 Task의 S 표시와 자동으로 일치)
- 정렬/펼침/접기: 이미 `is_summary` 기준
- Bulk operations 제외 규칙(`!is_summary`): standalone도 Summary로 취급되므로 제외됨 — **요구사항과 일치**

### 4) Import 로직 영향

`src/lib/punch-excel-utils.ts`의 `parentsToPromote` (line 641, 653-655) 흐름은 그대로 유효:
- 자식이 붙는 부모는 여전히 `is_summary=true`로 유지됨 (트리거가 동일 결과를 보장)
- 명시적 UPDATE 호출은 무해(이중 안전망)

### 5) 영향 없음

- Export, Detail, Bulk Edit, RLS, Field Registry 변경 없음
- 기존 Summary(76)에는 영향 없음

---

## 검수 포인트

1. 마이그레이션 후 `parent_id IS NULL AND is_summary = false` 행 수 = 0
2. Standalone 행이 Raw Data에서 Summary와 동일한 시각 표현(bold + 토글 + `S` 배지)으로 렌더링
3. 신규 Import에서 자식 없는 행도 자동 Summary로 저장됨
4. 자식 detach 시 부모가 자동으로 Summary 유지(자식 자체도 parent_id=null이 되며 Summary 승격)
