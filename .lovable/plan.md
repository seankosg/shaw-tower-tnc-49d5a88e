

## 요청 1: Admin — Raw Database 날짜별 스냅샷 저장/복원

### 개요
Admin 탭에 "Backup & Restore" 탭을 추가하여, `subtests` 테이블 전체를 특정 시점의 스냅샷으로 저장하고 필요 시 복원할 수 있도록 합니다.

### DB 변경

새 테이블 `database_snapshots` 생성:

```sql
CREATE TABLE public.database_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_name text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  snapshot_data jsonb NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text
);
ALTER TABLE public.database_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage snapshots" ON public.database_snapshots
  FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));
```

### 구현 상세

#### Admin 탭 추가: `BackupTab`

- **저장**: 버튼 클릭 → `subtests` 전체 SELECT → JSON으로 `database_snapshots.snapshot_data`에 저장. 스냅샷 이름은 `YYYY-MM-DD HH:mm` 자동생성 + 메모 입력 가능.
- **목록**: 저장된 스냅샷을 테이블로 표시 (날짜, 이름, row 수, 메모).
- **복원**: 선택한 스냅샷의 데이터로 현재 `subtests`를 교체.
  - 복원 프로세스: ① 현재 `subtests` 전체 DELETE → ② 스냅샷 JSON에서 INSERT.
  - 확인 다이얼로그 필수 ("현재 데이터가 모두 교체됩니다").
- **삭제**: 불필요한 스냅샷 삭제.

#### 주의사항
- `subtests` 테이블이 1000행 이상일 경우 Supabase 기본 limit을 고려하여 페이지네이션으로 전체 데이터를 가져옵니다.
- 복원 시 `upload_batches`, `upload_row_logs`, `subtest_change_log` 등 연관 테이블은 건드리지 않습니다 (subtests만 복원).
- Edge function으로 복원 로직을 구현하여 트랜잭션 안전성을 확보합니다.

### 수정/생성 파일
- `supabase/migrations/` — `database_snapshots` 테이블 생성
- `supabase/functions/restore-snapshot/index.ts` — 복원 Edge Function (DELETE + INSERT 트랜잭션)
- `src/pages/AdminPage.tsx` — `BackupTab` 추가 + TabsTrigger 추가

---

## 요청 2: Import 시 파일별 기준날짜(Data Date) 지정

### 개요
현재 Import 시 status가 `Done`인데 actual_date가 비어있으면 **어제 날짜(`yesterday`)**를 자동 채웁니다. 이 "어제"를 파일별로 사용자가 지정한 **Data Date**로 교체합니다.

### 기존 로직과의 충돌/변경점

| 항목 | 현재 | 변경 후 |
|---|---|---|
| **Auto-fill 기준일** | `new Date(Date.now() - 86400000)` (어제) | 사용자 지정 Data Date (기본값: 오늘) |
| **upload_batches 기록** | `uploaded_at`만 기록 | `data_date` 컬럼 추가 저장 |
| **updated_at** | Supabase trigger로 `now()` 자동 설정 — **변경 없음** | 동일 (updated_at은 레코드 수정 시점 유지) |
| **subtest_change_log** | `changed_at = now()` — **변경 없음** | 동일 |

**핵심**: `updated_at`과 `changed_at`은 실제 DB 수정 시각이므로 변경하지 않습니다. Data Date는 오직 **actual_date 자동 채움**에만 사용됩니다.

영향 받는 코드 (ImportContext.tsx):
- 239행: `const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);` → 파일별 `dataDate` 파라미터로 대체
- 319-321행: 신규 insert 시 actual_date auto-fill도 동일하게 `dataDate` 사용

### DB 변경

```sql
ALTER TABLE public.upload_batches ADD COLUMN data_date date;
```

### UI 변경 (ImportPage.tsx)

각 파일 카드에 **Data Date** 입력 필드 추가:
- `<input type="date" />` — 기본값: 오늘
- 파일별로 독립적으로 설정 가능
- Import 실행 중에는 비활성화

### 코드 변경

1. **ImportFileItem 인터페이스** — `dataDate?: string` 필드 추가
2. **ImportContext** — `addFiles` 시 `dataDate: new Date().toISOString().slice(0,10)` 기본값 설정
3. **ImportContext** — `setFileDataDate(id, date)` 함수 추가
4. **processFile** — `yesterday` 변수를 `item.dataDate || today`로 교체
5. **upload_batches insert** — `data_date: item.dataDate` 추가 저장
6. **ImportPage.tsx** — 파일 목록에 날짜 선택 UI 추가

### 수정/생성 파일
- `supabase/migrations/` — `upload_batches`에 `data_date` 컬럼 추가
- `src/contexts/ImportContext.tsx` — dataDate 로직, processFile 수정
- `src/pages/ImportPage.tsx` — 파일별 Data Date 입력 UI
- `supabase/functions/restore-snapshot/index.ts` — 스냅샷 복원 함수

