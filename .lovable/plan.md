## 목표

업체명(subcontractor / subsub), HDEC 사람 이름(PIC/ENG), 팀 이름 등의 텍스트 식별자를 시스템 전반에서 **대소문자 구분 없이(case-insensitive)** 동일한 값으로 취급합니다. 이미 일부 import 경로(`masterNameKey`, `keyOf`)는 lowercase 매칭을 하지만, **여전히 case-sensitive로 비교/조회되는 지점들이 남아있어** 같은 업체가 대소문자 차이로 중복 등록되거나, 사용자 동기화 시 매칭이 실패하는 현상이 발생합니다.

## 현재 상태 (조사 결과)

| 위치 | 현재 동작 | 문제 여부 |
|---|---|---|
| `src/lib/master-name-match.ts` | `masterNameKey`가 lowercase + trim | OK |
| `src/contexts/ImportContext.tsx` (subtest import) | 모든 캐시 키 lowercase | OK |
| `src/lib/defect-master-autocreate.ts` | `keyOf`로 캐시 비교는 lowercase | OK |
| `src/contexts/DefectImportContext.tsx` | profile/master 키는 lowercase, team enum은 정규화됨 | OK |
| **`supabase/functions/auto-create-master-user/index.ts`** | `.eq('subcontractor_name', name)` 등 **case-sensitive 비교** | **버그** |
| **`src/pages/AdminPage.tsx` (PIC/ENG 마스터 rename)** | `.eq('hdec_pic_name', r.name)` cascade | **버그** |
| **DB unique 제약** | 마스터 테이블에 case-insensitive unique 인덱스 없음 → 'ABC'와 'abc' 별개 행으로 INSERT 가능 | **버그** |
| Subcontractor master 매칭 (대소문자만 다른 경우) | exact set 비교는 lowercase지만 INSERT 시 충돌 방지 없음 | **버그** |

## 변경 범위

### 1. DB 레벨 — case-insensitive unique 인덱스 추가 (마이그레이션)

가장 중요한 단일 보호선. 같은 이름의 대소문자 변형으로 마스터가 중복 생성되지 않도록 강제:

- `subcontractor_master`: `(type, lower(name), coalesce(parent_subcontractor_id, '00000000-...'))` unique
- `hdec_pic_master`: `lower(name)` unique
- `hdec_eng_master`: `lower(name)` unique

기존 데이터 정합성 정리 — 이미 대소문자만 다른 중복 row가 있다면 첫 번째(가장 오래된)를 유지하고 나머지는 비활성화하지 않고 그대로 두되, 새 unique 인덱스는 partial(`WHERE is_active = true`)로 만들어 충돌을 회피합니다. 필요하면 admin이 수동 정리.

### 2. Profile / 마스터 조회를 case-insensitive로 통일

**`supabase/functions/auto-create-master-user/index.ts`**
- 모든 `.eq('subcontractor_name', x)`, `.eq('subsub_name', x)`, `.eq('hdec_pic_name', x)`, `.eq('hdec_eng_name', x)`를 `.ilike(field, name)`로 변경 (정확히 같은 문자열만 다른 케이스 — wildcard 미사용).

**`src/pages/AdminPage.tsx`**
- PIC/ENG 마스터 이름 변경 시 cascade 업데이트(`subtests`, `defect_items`)에 사용되는 `.eq(...)`를 `.ilike(...)`로 변경.
- 마스터 카운트 조회도 동일.

**`src/lib/defect-master-autocreate.ts`**
- `ensureSubcontractor` / `ensureSubsub` / `ensureHdecPic` / `ensureHdecEng`에서 INSERT 전 `ilike`로 한 번 더 확인 → 캐시 미스 + 다른 케이스 기존 행이 있을 때 그 row를 재사용 (DB unique 인덱스 충돌 방지).

### 3. Defect 분류 / 팀 매칭

`DefectImportContext.tsx` `resolveTeam` / `resolveOwnerCode`는 이미 `masterNameKey`(lowercase) 기반이라 변경 없음.

### 4. UI 표시 정책

저장된 원본 이름(대소문자 그대로)을 사용자가 입력한 형태로 보존합니다. 즉:
- 비교는 case-insensitive
- 표시는 원래 입력된 대로 (예: 'ACME Corp'이 마스터에 있으면 'acme corp'으로 들어와도 'ACME Corp'로 매칭)

## 기술 세부 — 마이그레이션 SQL 예시

```sql
-- subcontractor: type + lower(name) + parent unique (active만)
CREATE UNIQUE INDEX subcontractor_master_ci_unique
  ON public.subcontractor_master (
    type,
    lower(name),
    COALESCE(parent_subcontractor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_active = true;

CREATE UNIQUE INDEX hdec_pic_master_ci_unique
  ON public.hdec_pic_master (lower(name)) WHERE is_active = true;

CREATE UNIQUE INDEX hdec_eng_master_ci_unique
  ON public.hdec_eng_master (lower(name)) WHERE is_active = true;
```

## 변경 파일 요약

- `supabase/migrations/<new>.sql` — case-insensitive unique 인덱스 3개
- `supabase/functions/auto-create-master-user/index.ts` — 4개 `.eq` → `.ilike`
- `src/pages/AdminPage.tsx` — PIC/ENG cascade 업데이트와 카운트 조회 `.eq` → `.ilike`
- `src/lib/defect-master-autocreate.ts` — 각 ensure 함수에서 INSERT 전 `ilike` 중복 확인 + 발견 시 캐시에 흡수

## 적용되지 않는 것

- 이미 저장된 마스터의 표기를 일괄 normalize 하지 않음 (사용자가 의도적으로 입력한 표기 보존).
- `team`, `user_type` 등 enum 컬럼은 변경 없음 — 이미 정규화되어 들어옴.
- `login_id`/`email`은 별개 도메인 — 본 플랜 범위 외.
