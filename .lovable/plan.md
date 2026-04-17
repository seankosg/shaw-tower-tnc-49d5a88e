

## SubSub(재하도) 컬럼 추가 — 구현 계획

### 결정 요약 (사용자 선택 반영)
- **user_type**: `subcontractor` 재사용 (enum 확장 없음)
- **Profile 필드**: `profiles.subsub_name` 신규 컬럼
- **Master 테이블**: `subcontractor_master` 통합 + `type` 컬럼('sub' | 'subsub')
- **부모 관계**: `parent_subcontractor_id` FK로 추적

---

### 1. DB 마이그레이션

**`subcontractor_master` 확장**
```sql
ALTER TABLE subcontractor_master
  ADD COLUMN type text NOT NULL DEFAULT 'sub' CHECK (type IN ('sub','subsub')),
  ADD COLUMN parent_subcontractor_id uuid REFERENCES subcontractor_master(id);
-- subsub는 반드시 parent를 가져야 함 (validation trigger)
CREATE TRIGGER trg_subsub_parent_required ... -- type='subsub'면 parent NOT NULL
```

**`profiles` 확장**
```sql
ALTER TABLE profiles ADD COLUMN subsub_name text;
```

**`subtests` 확장**
```sql
ALTER TABLE subtests ADD COLUMN subsub_name text;
```

**`field_config` 추가**
```sql
INSERT INTO field_config (field_name, display_name, sort_order, ...)
VALUES ('subsub_name', 'SubSub', 51.5, ...);  -- Subcontractor와 HDEC PIC 사이
```

**`handle_new_user()` 함수 수정**: `subsub_name` 메타데이터 처리

---

### 2. Import 파서 (`src/lib/import-parser.ts`)
- `HEADER_MAP`에 `subsub`, `sub-sub`, `sub_sub`, `subsub_name` 추가
- `ParsedSubtest`에 `subsub_name: string | null` 추가
- `parseLegacy` / `parseStandard` 양쪽에서 추출
- 컬럼 순서: Subcontractor → **SubSub** → HDEC PIC

### 3. Import 컨텍스트 (`src/contexts/ImportContext.tsx`)
- update 필드 배열 + insert payload에 `subsub_name` 추가

### 4. 표시/편집 화면
| 파일 | 변경 |
|------|------|
| `SubtestDetail.tsx` | 폼 필드, save payload, change log fields에 `subsub_name` 추가 (Subcontractor 옆에 배치) |
| `MobileUpdatePage.tsx` | 카드에 SubSub 입력 필드 추가 |
| `ExportPage.tsx` | select 컬럼 + 'SubSub' 헤더 추가 (Subcontractor와 HDEC PIC 사이) |
| `SubtestList.tsx` | 컬럼 추가 (선택 — 사용자 필요 시) |

### 5. Admin UI (`src/pages/AdminPage.tsx`)

**Masters 탭 (Subcontractor / HDEC PIC)** 개편:
- `subcontractor_master` 표시를 두 섹션으로 분리: **Subcontractors** / **SubSubs**
- SubSub 추가 시: 이름 + 상위 Subcontractor 선택(드롭다운, type='sub' 필터)
- `Sub`을 `SubSub`로 또는 그 반대로 변환 방지

**Users 탭** 개편:
- `user_type='subcontractor'`인 사용자 생성/편집 시 추가 옵션:
  - **Affiliation**: "Subcontractor" / "SubSub" 라디오
  - SubSub 선택 시 → SubSub 마스터 드롭다운 (`subsub_name` 저장) + 자동으로 parent의 subcontractor_name도 함께 저장
  - Sub 선택 시 → 기존처럼 `subcontractor_name`만 저장
- 사용자 목록 테이블에 SubSub 컬럼 표시

### 6. Edge Function (`admin-create-user`)
- `Body` 인터페이스에 `subsub_name?: string | null` 추가
- `user_metadata`에 `subsub_name` 포함

### 7. 권한 영향 (참고만, 이번엔 변경 안 함)
- 현재 RLS는 `system_id` 기반 권한이라 SubSub 사용자도 동일 메커니즘으로 동작
- 향후 "SubSub는 자기 회사 row만" 필터링은 별도 작업으로 분리

---

### 영향 파일 요약
| 영역 | 파일 |
|------|------|
| DB | 신규 migration 1개 |
| Import | `import-parser.ts`, `ImportContext.tsx` |
| 표시/편집 | `SubtestDetail.tsx`, `MobileUpdatePage.tsx`, `ExportPage.tsx` |
| Admin | `AdminPage.tsx` (Masters + Users 탭) |
| Auth | `AuthContext.tsx` (Profile 타입), `admin-create-user/index.ts` |

### 사용자 시나리오
1. Admin → Masters 탭 → "Add SubSub" → 이름 + 상위 Subcontractor 선택
2. Admin → Users 탭 → 새 사용자 생성 → user_type=subcontractor, Affiliation=SubSub, 회사 선택
3. Excel import 시 SubSub 컬럼 자동 인식 → subtests에 저장
4. SubtestDetail / Mobile / Export 모두 SubSub 표시·편집 가능

