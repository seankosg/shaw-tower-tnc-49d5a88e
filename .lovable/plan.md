# Planned Closure Date 자동 계산 + 일회성 백필

## 요구사항
`planned_closure_date`가 비어있고 `planned_completion_date`가 존재할 때, `planned_completion_date + 4 영업일`(일요일만 skip, 토요일은 영업일로 카운트)로 자동 채웁니다.

**예시 검증**: 4/29(수) + 4 = 4/30(목)→5/1(금)→5/2(토)→5/3(일,skip)→5/4(월) ✓

DB의 `add_business_days_no_sun(date, days)` 함수와 클라이언트의 `addBusinessDaysNoSunday()` (`src/lib/business-days.ts`) 모두 동일한 로직을 이미 구현하고 있어 그대로 재사용합니다.

## 현재 DB 상태
- 전체 active defect: 3,332건
- planned_closure_date 없음: 2,914건
- 그 중 채울 수 있는 것 (planned_completion_date 존재): **2,391건** ← 백필 대상

## 구현 범위

### 1) 일회성 백필 마이그레이션
DB의 `add_business_days_no_sun` 함수를 사용하여 기존 데이터 일괄 업데이트:

```sql
UPDATE public.defect_items
SET planned_closure_date = public.add_business_days_no_sun(planned_completion_date, 4),
    updated_at = now(),
    row_version = row_version + 1
WHERE is_active = true
  AND planned_closure_date IS NULL
  AND planned_completion_date IS NOT NULL;
```

스키마 변경은 아니지만 일회성 대량 데이터 변경이므로 migration 파일로 처리합니다 (감사 추적 목적).

추가로, 백필된 행에 대해 `closure_status`도 재계산 가능하도록 `recompute-defect-status` edge function을 한 번 호출합니다(상태 보정).

### 2) Import 시 자동 채움 (`src/lib/defect-parser.ts`)
`parseDefectRow` 결과에서 `planned_closure_date`가 null이고 `planned_completion_date`가 있으면 `addBusinessDaysNoSunday(planned_completion_date, 4)`로 자동 derive.
- Excel에 명시적 closure date가 있으면 그대로 우선 (덮어쓰지 않음).

### 3) Raw Data 인라인 편집 / Detail 페이지 자동 채움
대상: `src/pages/DefectRawDataPage.tsx`, `src/pages/DefectDetailPage.tsx`

사용자가 `planned_completion_date`를 변경하거나 입력할 때, 같은 행의 `planned_closure_date`가 비어있으면 동일 공식으로 자동 derive해서 함께 저장.
- 사용자가 직접 closure date를 입력한 경우는 절대 덮어쓰지 않음.
- 인라인 편집(셀 단위)에서도 동일 로직 적용.

### 4) (선택) DB 트리거로 안전망 추가
백엔드 어디서 들어와도 안전하게 채워지도록 `defect_items`에 `BEFORE INSERT OR UPDATE` 트리거를 추가하는 옵션. 이를 적용하면 향후 모든 경로(REST, edge function 등)에서 자동 보정됩니다.

```sql
CREATE OR REPLACE FUNCTION public.fn_defect_autofill_planned_closure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.planned_closure_date IS NULL AND NEW.planned_completion_date IS NOT NULL THEN
    NEW.planned_closure_date := public.add_business_days_no_sun(NEW.planned_completion_date, 4);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_defect_autofill_planned_closure
BEFORE INSERT OR UPDATE OF planned_completion_date, planned_closure_date
ON public.defect_items
FOR EACH ROW EXECUTE FUNCTION public.fn_defect_autofill_planned_closure();
```

이 트리거를 두면 클라이언트 코드 누락이 있어도 자동 보정됩니다. **권장** 옵션.

## 수정 대상 파일
- `supabase/migrations/<new>.sql` — 일회성 백필 + 자동 채움 트리거(권장)
- `src/lib/defect-parser.ts` — import 시 자동 derive
- `src/pages/DefectRawDataPage.tsx` — 인라인 편집 시 자동 derive (UI 즉시 반영)
- `src/pages/DefectDetailPage.tsx` — Detail 페이지 저장 시 자동 derive

## 영향
- 기존 2,391건 즉시 보정됨.
- 신규 import / 편집 / 직접 DB 변경 모든 경로에서 일관되게 자동 채움.
- closure date를 사용자가 직접 입력한 케이스는 보존(덮어쓰기 없음).

승인하시면 진행하겠습니다.
