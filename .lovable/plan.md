## 목적
Defect Management에서 각 행의 `created_at` 값이 **2026-06-26 이상**인 항목을 별도의 **Post CSC** 세트로 분리 표시. Dashboard / Raw Data 페이지에 `Pre CSC` / `Post CSC` 탭을 추가하고, 이후 신규 import는 각 row의 `created_at`로 자동 라우팅된다. 마스터·필드설정·RLS·Critical Issue Board는 두 세트가 공유.

## 설계 개요

### 판정 방식
- `defect_items`에 `is_post_csc boolean NOT NULL DEFAULT false` 컬럼 추가.
- 판정 기준: **row의 `created_at` >= '2026-06-26' (SGT, Asia/Singapore)**.
- 생성/업데이트 시 DB 트리거로 자동 세팅 → 앱 코드가 실수로 비워둬도 항상 일관.
- 컬럼에 인덱스(`is_post_csc, is_active`) 추가.

```text
row.created_at ──▶ trigger ──▶ is_post_csc
                                    │
     ┌──────────────────────────────┼──────────────────────────────┐
     ▼                              ▼                              ▼
 Pre CSC 탭                     공유(마스터/RLS/필드)             Post CSC 탭
 (Dashboard/Raw Data)                                           (Dashboard/Raw Data)
```

### 1회 마이그레이션
- 기존 defect_items 중 `created_at >= 2026-06-26 SGT` 인 행에 `is_post_csc = true` 세팅.
- 마이그레이션 결과 카운트를 반환하여 확인.

### Import 라우팅
- `DefectImportContext`에서 upsert payload에 `is_post_csc`를 계산해 포함(각 row의 최종 created_at 기준). 신규 row는 자동 라우팅. 기존 row는 트리거가 재계산.
- Pre/Post CSC 어느 탭에서 import 하든 동일 로직(파일 안에 두 시기가 섞여도 자동 분류).

### UI 변경
- **DefectDashboardPage / DefectRawDataPage** 상단에 `Pre CSC | Post CSC` Tabs 추가.
  - URL 쿼리 `?csc=pre|post` 로 상태 보존, 기본값 `pre`.
  - 선택 탭 값을 컨텍스트/prop 으로 하위 필터에 주입 → 두 탭 모두 동일 컴포넌트를 재사용하고 데이터만 서브셋으로 필터.
- 캐시 (`src/lib/defect-cache.ts`) SLIM_COLUMNS 화이트리스트에 `is_post_csc` 추가.
- 대시보드 집계 함수 및 Raw Data 필터는 선택된 탭 값에 따라 `is_post_csc` 로 필터.
- Detail 페이지에는 뱃지(`Pre CSC` / `Post CSC`)만 표시(전환 UI 없음, 자동 계산).

### 공유 유지
- **Critical Issue Board**: 두 탭 데이터를 통합 표시(변경 없음). 필요 시 향후 필터 추가 가능.
- **마스터 / 필드 설정 / Custom Fields / RLS**: 그대로 공유. 별도 테이블/정책 만들지 않음.
- **Import Batch / 감사 로그 / Comments / 잠금 플래그**: 기존 그대로 상속.

## 기술 메모

### Migration SQL 개요
```sql
ALTER TABLE public.defect_items
  ADD COLUMN is_post_csc boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_defect_post_csc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_post_csc := (
    (NEW.created_at AT TIME ZONE 'Asia/Singapore')::date >= DATE '2026-06-26'
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_defect_set_post_csc
BEFORE INSERT OR UPDATE OF created_at ON public.defect_items
FOR EACH ROW EXECUTE FUNCTION public.set_defect_post_csc();

-- 1회 backfill
UPDATE public.defect_items
SET is_post_csc = true
WHERE (created_at AT TIME ZONE 'Asia/Singapore')::date >= DATE '2026-06-26';

CREATE INDEX IF NOT EXISTS idx_defect_items_post_csc
  ON public.defect_items (is_post_csc, is_active);
```

### 영향 파일
- `supabase/migrations/<new>.sql`
- `src/lib/defect-cache.ts` (SLIM_COLUMNS)
- `src/lib/defect-utils.ts` (DefectItem 인터페이스)
- `src/pages/DefectDashboardPage.tsx` (탭 + 필터 주입)
- `src/pages/DefectRawDataPage.tsx` (탭 + 필터 주입)
- `src/pages/DefectDetailPage.tsx` (뱃지)
- `src/contexts/DefectImportContext.tsx` (payload에 is_post_csc 포함 — 안전망, 실제로는 트리거가 결정)
- 대시보드 집계 유틸이 items 배열을 파라미터로 받는 구조이므로 별도 수정 불필요(상위에서 사전 필터).

### 비대상(현 요청 범위 밖)
- 별도 RLS/권한 분기 없음.
- Critical Issue Board 탭 분리 없음(공유 유지).
- Reports/PPT 슬라이드 분리 없음(추후 요청 시).
