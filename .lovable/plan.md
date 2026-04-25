## 목표

Defect Management 시스템에 **`HDEC Eng`** 라는 신규 독립 필드를 추가하고, Excel Import 시 **"Engineer"가 포함된 모든 헤더**는 이 새 필드로, 나머지 PIC 계열은 기존 `HDEC PIC` 필드로 분리 매핑합니다.

---

## 헤더 매핑 분리 규칙

현재 모든 변형이 `hdec_pic_name` 한 곳으로 매핑되고 있는 것을 다음과 같이 분리합니다:

### → 신규 `hdec_eng_name` (Engineer 계열)
- `HDEC ENG`, `HDEC Eng`, `HDEC_Eng`, `HDEC Eng Name`
- `HDEC Engineer`
- **`Responsible Engineer`**
- **`Engineer In Charge`**

### → 기존 `hdec_pic_name` (PIC 계열, 변경 없음)
- `HDEC PIC`, `HDEC P.I.C`, `HDEC PIC Name`, `HDEC_PIC`
- `HDEC In Charge`, `HDEC Person In Charge`
- `Responsible PIC`, `Person In Charge`, `In Charge`, `PIC Name`, `PIC`
- `담당자`, `담당`, `HDEC 담당자`

---

## 변경 사항

### 1. 데이터베이스 (Migration)

#### A. `defect_items` 컬럼 추가
```sql
ALTER TABLE public.defect_items ADD COLUMN hdec_eng_name text;
```

#### B. 신규 마스터 테이블 `hdec_eng_master`
`hdec_pic_master`와 동일한 구조 + RLS:
- 컬럼: `id`, `name`, `is_active`, `created_at`
- RLS: 인증 사용자 read / admin·superuser manage·insert
- `name`에 case-insensitive UNIQUE 인덱스

#### C. `defect_field_config` 등록
- `field_name = 'hdec_eng_name'`, `display_name = 'HDEC Eng'`, `source_origin = 'system'`
- visible/editable roles는 `hdec_pic_name`과 동일

> `defect_change_log` / `defect_schedule_change_audit` / Rollback 함수는 동적 필드명 기반이라 자동 동작.

---

### 2. Parser (`src/lib/defect-parser.ts`)

`FIELD_ALIASES` 분리:
```ts
// → hdec_eng_name (신규)
'hdec eng': 'hdec_eng_name',
'hdec engineer': 'hdec_eng_name',
'hdec_eng': 'hdec_eng_name',
'hdec eng name': 'hdec_eng_name',
'responsible engineer': 'hdec_eng_name',
'engineer in charge': 'hdec_eng_name',

// → hdec_pic_name (기존 유지, 위 6개 제거)
'hdec pic': 'hdec_pic_name',
'hdec p i c': 'hdec_pic_name',
'hdec_pic': 'hdec_pic_name',
'hdec pic name': 'hdec_pic_name',
'hdec in charge': 'hdec_pic_name',
'hdec person in charge': 'hdec_pic_name',
'responsible pic': 'hdec_pic_name',
'person in charge': 'hdec_pic_name',
'in charge': 'hdec_pic_name',
'pic name': 'hdec_pic_name',
pic: 'hdec_pic_name',
'담당자': 'hdec_pic_name',
'담당': 'hdec_pic_name',
'hdec 담당자': 'hdec_pic_name',
```

- `ParsedDefectRow`에 `hdec_eng_name: string | null` 추가
- `rows.map()`에 `hdec_eng_name: toText(getMapped(raw, 'hdec_eng_name'))` 추가

---

### 3. Import Context (`src/contexts/DefectImportContext.tsx`)

- Insert/Update payload에 `hdec_eng_name` 포함
- Update 비교 대상에 추가 → `defect_change_log` 자동 기록
- Re-import(update-only) 모드에서도 동일 처리

---

### 4. Master 자동 등록 (`src/lib/defect-master-autocreate.ts`)

`ensureHdecPic` 패턴을 본떠 **`ensureHdecEng`** 함수 추가:
- `hdec_eng_master`에서 기존 이름 조회
- 신규 이름이면 자동 insert
- 캐싱으로 동시 import 중복 방지

---

### 5. 타입 (`src/lib/defect-utils.ts`)

- `DefectItem`에 `hdec_eng_name: string | null` 추가
- `DEFECT_RESPONSIBILITY_FIELDS`에는 **포함하지 않음** (기존 권한 정책 유지)

---

### 6. UI

#### `src/pages/DefectDetailPage.tsx`
- 폼 state에 `hdec_eng_name` 추가
- "HDEC PIC" 셀렉트 아래 **"HDEC Eng"** 셀렉트 신규 추가 (옵션은 `hdec_eng_master`)
- Save payload에 포함

#### `src/pages/DefectRawDataPage.tsx`
- 컬럼 키 목록(`COLUMN_KEYS` 등)에 `hdec_eng_name` 추가
- 필터 옵션 / 정렬 / 표시 라벨("HDEC Eng") 추가

#### Export (`defect-export-utils.ts`, `defect-excel-export.ts`)
- `responsibility` 그룹에 `hdec_eng_name` 포함
- Re-import ready export에도 컬럼 포함 (round-trip 보장)

---

### 7. 자동 갱신 파일
- `src/integrations/supabase/types.ts` — 마이그레이션 후 자동 갱신 (편집 X)

---

## 동작 시나리오 예시

Excel 한 파일에 두 컬럼이 모두 있을 때:

| Excel 헤더 | 값 | 저장 위치 |
|---|---|---|
| `HDEC PIC` | "Kim, J.S." | `hdec_pic_name` |
| `Responsible Engineer` | "Lee, K.H." | `hdec_eng_name` |
| `Engineer In Charge` | (위와 동일 컬럼이면) "Lee, K.H." | `hdec_eng_name` |

두 필드는 완전히 독립이며, 마스터도 각각 자동 등록됩니다.

---

## 변경/생성 파일

**신규**
- `supabase/migrations/<ts>_add_hdec_eng_field.sql`

**수정**
- `src/lib/defect-parser.ts`
- `src/lib/defect-utils.ts`
- `src/lib/defect-master-autocreate.ts`
- `src/contexts/DefectImportContext.tsx`
- `src/pages/DefectDetailPage.tsx`
- `src/pages/DefectRawDataPage.tsx`
- `src/lib/defect-export-utils.ts`
- `src/lib/defect-excel-export.ts`

---

## 영향 범위 / 주의

- **기존 데이터**: 기존 행의 `hdec_eng_name`은 NULL로 시작. `hdec_pic_name` 기존 값은 손대지 않음.
- **이미 PIC로 들어간 Engineer 데이터**: 과거 import에서 `Responsible Engineer` 등이 `hdec_pic_name`으로 들어가 있을 수 있음 → **자동 마이그레이션 없음**. 필요 시 별도 정리 작업 요청 가능.
- **재import 호환성**: 이전 export 파일을 그대로 다시 올리면 ENG 컬럼이 없어 NULL 유지(안전).
- **권한**: `validate_defect_responsibility_update`는 PIC 3필드만 검증 → Engineer 필드는 일반 편집 권한으로 수정 가능.
- **T&C(subtests) 모듈**: 영향 없음. Defect 모듈에만 적용.
