## 목표

Punch Raw Data에서 완료된 항목(`Completion Status = Done`)을 시각적으로 약화시키고, `Actual Completion Date` 입력만으로도 자동으로 Done 처리되도록 한다.

- Completion Status는 기존대로 사용자 입력 가능 (Bulk Edit + Detail 페이지)
- `actual_completion_date`에 값이 있으면 자동 `Done`
- Done인 행은 글자 전체가 흐린 회색(muted)

---

## 구현 계획

### 1) DB 트리거 — actual_completion_date → completion_status 자동 동기화

`supabase/migrations/<new>_punch_completion_status_autoset.sql`

```sql
CREATE OR REPLACE FUNCTION public.punch_items_autoset_completion_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- actual_completion_date 입력 시 → 자동 Done
  IF NEW.actual_completion_date IS NOT NULL THEN
    NEW.completion_status := 'Done';
  -- actual_completion_date 제거 시 → 자동으로 Done에서 해제
  ELSIF (TG_OP = 'UPDATE' AND OLD.actual_completion_date IS NOT NULL
         AND NEW.actual_completion_date IS NULL
         AND NEW.completion_status = 'Done') THEN
    NEW.completion_status := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS punch_items_autoset_completion_status ON public.punch_items;
CREATE TRIGGER punch_items_autoset_completion_status
BEFORE INSERT OR UPDATE OF actual_completion_date, completion_status
ON public.punch_items
FOR EACH ROW
EXECUTE FUNCTION public.punch_items_autoset_completion_status();

-- 기존 데이터 일회 정합화
UPDATE public.punch_items
SET completion_status = 'Done'
WHERE actual_completion_date IS NOT NULL
  AND (completion_status IS NULL OR completion_status <> 'Done');
```

### 2) `src/pages/PunchRawDataPage.tsx` — 셀 렌더링

`renderCell`의 `completion_status` case 추가:
- 값이 `Done`일 때 muted 톤의 작은 배지(`bg-muted text-muted-foreground border-border`)로 표시
- 값이 없지만 `actual_completion_date`가 있으면(DB 동기화 지연 대비 안전망) 동일하게 `Done` 배지로 표시
- 그 외 값은 평문 텍스트

### 3) `src/pages/PunchRawDataPage.tsx` — Done 행 muted 처리

`PunchRawTableView`의 `<TableRow>` 렌더링 부분에서 행 단위 helper 추가:

```ts
const isDoneRow = (r: PunchItem) =>
  String(r.completion_status ?? '').toLowerCase() === 'done'
  || !!r.actual_completion_date;
```

- 해당 행 `<TableRow>`에 `text-muted-foreground/70` 클래스 부여 (Summary/Subtask 모두 적용)
- 단, 식별자 `summary_no` / `subtask_no` 셀과 상태 배지(`HealthBadge`, `GateDot`, Progress Icon, override M 배지 등)는 자체 색을 유지해야 가독성 확보 → 행 전체 muted는 텍스트 셀에만 영향이 있도록 `[&_.cell-text]` 선택자 대신 단순 `text-muted-foreground/70` 행 클래스만 적용하고 배지 컴포넌트는 자기 색을 우선시함(이미 그렇게 동작). Bold(Summary/Standalone 식별자 셀)도 유지.
- hover/selected 상태에서는 muted 효과를 약하게 유지(기존 hover 배경은 그대로).

### 4) (선택) `useFieldConfig` 표시 라벨 영향 없음 — 변경 없음

### 5) 영향 없음
- Import (`punch-excel-utils.ts`): 트리거가 자동 처리 → 코드 변경 불필요. `actual_completion_date`만 채워 넣어도 DB에서 Done 처리.
- Export (`punch-excel-export.ts`): DB 값 그대로 내보내므로 자동으로 정합화된 'Done'이 export됨.
- Detail/Bulk Edit: 기존 UI 그대로. `completion_status`는 select 옵션에서 `Done`만 사용 중이므로 별도 변경 없음.
- RLS: 변경 없음.

## 검수 포인트

1. `actual_completion_date`가 있는 기존 행이 모두 `completion_status='Done'`이 됨
2. Detail에서 `actual_completion_date`를 채우면 `completion_status`가 자동 `Done`이 됨
3. `actual_completion_date`를 비우면 `Done`이 해제됨(다른 값으로 수동 설정된 경우는 보존)
4. Done 행은 텍스트가 muted 회색으로 렌더링되지만 식별자 굵기/상태 배지 색은 유지
5. Done 배지가 `completion_status` 컬럼에 일관되게 표시
