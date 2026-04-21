

## Field Config에 Pred Planned / Pred Actual 추가 (기본 숨김)

### DB 변경

`field_config` 테이블에 2개 행 INSERT:

```sql
INSERT INTO public.field_config (field_name, display_name, is_enabled, is_required, sort_order)
VALUES
  ('pred_planned_date', 'Pred Planned Date', false, false, 122),
  ('pred_actual_date',  'Pred Actual Date',  false, false, 124);
```

- `is_enabled: false` → 기본 숨김 처리
- `sort_order: 122, 124` → Predecessor Status(120) 바로 뒤, T1 Planned Date(130) 앞에 배치

### 코드 변경 없음

`useFieldConfig` 훅이 `is_enabled = false`인 필드를 자동으로 숨기므로, `SubtestList.tsx`나 다른 파일 수정은 불필요합니다.

### 수정 파일
- `supabase/migrations/` — INSERT 마이그레이션 1개

