# Custom 시스템 필드 생성/매핑 기능 구현 계획

관리자가 엑셀 임포트 시 매핑할 새로운 시스템 필드를 직접 생성/관리할 수 있도록 합니다. 데이터는 JSONB(`raw_payload` / `custom_payload`)에 저장되며, T&C와 Defect 모두 지원합니다.

## 1. 데이터베이스 마이그레이션

**새 테이블: `custom_field_definitions`**
- `id uuid PK`
- `module text` — `'tnc'` | `'defect'` (CHECK 제약)
- `field_name text` — 코드용 키 (snake_case, 영문/숫자/_, 생성 후 변경 불가)
- `display_name text` — 화면 표시명
- `data_type text` — `'text'` | `'number'` | `'date'` | `'boolean'` (CHECK)
- `is_active bool default true`
- `sort_order int default 0`
- `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`
- UNIQUE `(module, field_name)`
- RLS: SELECT 모두 인증, ALL은 admin/superuser만

**`subtests` 테이블 변경**
- `custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb` 컬럼 추가
- (Defect는 기존 `defect_items.raw_payload` 활용)

**`app_settings` 버전 키**
- `custom_fields_version` 키 추가 (변경 시 트리거로 갱신 → 클라이언트 캐시 무효화)

**검증 트리거**
- `custom_field_definitions` INSERT/UPDATE 시:
  - `field_name`이 `^[a-z][a-z0-9_]*$` 정규식 매칭 검증
  - 시스템 예약 필드명(예: `id`, `item_no`, `mos_code`, `t1_planned_date` 등)과 충돌 차단
  - UPDATE 시 `field_name`, `module` 변경 차단
  - `data_type` 변경 시: 해당 모듈에서 데이터가 존재하면 차단(안전장치)
- `import_header_mappings` 검증 트리거 보강:
  - `target_field`가 `custom:<field_name>` 형태이면 `custom_field_definitions`에 존재 + 활성화 확인

**감사 로그**
- `custom_field_definitions` 변경을 `event_log`에 기록하는 트리거

## 2. 매핑 표현 방식

`import_header_mappings.target_field` 값 규칙:
- 시스템 필드: 기존대로 `t1_planned_date`, `description` 등
- 커스텀 필드: `custom:<field_name>` 접두사 (예: `custom:client_ref`)

## 3. 파서 로직 변경

**`src/lib/import-parser.ts` (T&C)**
- 매핑 적용 시 `target_field`가 `custom:`로 시작하면:
  1. `custom_field_definitions`에서 정의 조회 (캐시)
  2. `data_type`에 따라 변환:
     - `text` → 문자열
     - `number` → `Number()` 파싱, NaN이면 reject
     - `date` → 기존 날짜 파서 재사용 (ISO date)
     - `boolean` → `'Y'/'N'/'true'/'false'/'1'/'0'` 변환
  3. 변환 실패 시 `import_field_logs`에 reject 기록
  4. 성공 시 `subtests.custom_payload[field_name] = value`로 누적 후 upsert
- 시스템 필드 처리 로직은 변경 없음 (기존 동작 유지)

**`src/lib/defect-parser.ts` (Defect)**
- 동일 로직, 저장 위치는 `defect_items.raw_payload[field_name]`
- 단, `raw_payload`는 현재 "원본 행 전체"를 저장하는 용도로 쓰일 가능성이 있어 **충돌 방지**:
  - 옵션: `raw_payload._custom` 하위 객체로 분리 저장 → 기존 raw 보존
  - 또는 별도 컬럼 `custom_payload` 추가 (T&C와 동일 패턴, 일관성 ↑) ← **권장**
  - 결정: Defect도 `custom_payload jsonb` 컬럼 신규 추가하여 일관성 유지

## 4. 새 훅/캐시

- `src/hooks/useCustomFields.ts` — 모듈별 활성 필드 조회, `custom_fields_version` 기반 무효화
- `src/lib/custom-fields-cache.ts` — `header-mappings-cache.ts`와 동일 패턴

## 5. Admin UI

**신규 탭: `src/pages/admin/CustomFieldsTab.tsx`**
- 모듈 선택 (T&C / Defect)
- 필드 목록 (display_name, field_name, data_type, active, sort_order)
- 추가/수정 다이얼로그:
  - field_name (생성 후 lock)
  - display_name
  - data_type 선택
  - data_type 변경 시 데이터 존재 경고
- 비활성화/삭제 (데이터 있으면 삭제 차단, 비활성만 가능)

**`HeaderMappingsTab.tsx` 수정**
- target_field 드롭다운에 활성 custom field들을 `[Custom] display_name` 형태로 추가
- 선택 시 내부적으로 `custom:<field_name>`으로 저장
- "+ Create new system field" 바로가기 버튼 → CustomFieldsTab 다이얼로그 열기

**`AdminPage.tsx`**
- 탭 라우팅에 `Custom Fields` 추가

## 6. 표시/내보내기 (최소 변경)

이번 단계는 **임포트→저장**까지가 스코프. 상세화면/Export에서 custom field를 열로 보여주는 것은 다음 단계 옵션으로 남깁니다(요청 시 추가). 현재는:
- 데이터는 정확히 JSONB에 저장
- Detail 페이지에서 raw_payload/custom_payload 영역에 "Custom Fields" 섹션으로 key-value 표시 (간단 렌더만)

## 7. 안전장치 요약

- field_name immutable, module immutable
- 시스템 예약어 충돌 방지
- 데이터 존재 시 type 변경/삭제 차단
- 매핑 트리거가 존재하지 않는 custom 필드로의 매핑 차단
- 모든 변경 event_log 기록

## 영향 파일

신규:
- `supabase/migrations/<ts>_custom_field_definitions.sql`
- `src/hooks/useCustomFields.ts`
- `src/lib/custom-fields-cache.ts`
- `src/pages/admin/CustomFieldsTab.tsx`

수정:
- `src/lib/import-parser.ts`
- `src/lib/defect-parser.ts`
- `src/pages/admin/HeaderMappingsTab.tsx`
- `src/pages/AdminPage.tsx`
- (옵션) Subtest/Defect Detail 페이지 — Custom Fields 섹션

## 기존 로직과의 호환성

- 기존 시스템 필드 매핑 흐름은 변경 없음 (분기 추가만)
- `raw_payload`(defect) 기존 사용처 영향 없음 — 별도 `custom_payload` 컬럼 사용
- `import_header_mappings` 스키마는 변경 없음 (값 규약만 확장)
- 캐시 무효화는 `header_mappings_version`과 같은 패턴
