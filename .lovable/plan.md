## 목표

현재 `DocsDrawingDetailPage`는 JSON 덤프만 보여주는 임시 화면입니다. 이를 기존 두 모듈의 상세 편집 페이지와 동일한 UX로 전면 교체합니다.

참고 모듈:
- T&C → `src/pages/SubtestDetail.tsx`
- Defect → `src/pages/DefectDetailPage.tsx`

라우트 `/docs/:id` → `DocsDrawingDetailPage` 는 이미 등록되어 있습니다. Raw Data 행 클릭 시 이 라우트로 이동하도록 추가 연결합니다.

## 페이지 구성

`AppLayout` 안에 3개 카드로 구성합니다.

```text
[Back]                                                  [Save] (편집 권한 있을 때만)

Card: ITEM DETAIL — <Document No>   |  Risk 뱃지  |  Overall Status 뱃지
  3-컬럼 그리드, 그룹별 정렬:

  Identification          Classification          Cycle / Status
  - document_no (RO)      - trade (Select)        - aconex_status (Select)
  - revision              - discipline            - current_status (Select)
  - title                 - sheet_name            - is_submitted (Yes/No)
  - series                - document_type         - transmittal_number
  - level_location                                - transmittal_due_date
  - sequential_no                                 - days_due (RO, 파생값)

  Parties                 Sub1                    Sub2                    Sub3
  - subcontractor         - planned_date          - planned_date          - planned_date
    (master Select,       - submission_date       - submission_date       - submission_date
     subcontractor_id +   - approval_date         - approval_date         - approval_date
     subcontractor_name   - actual_response_date  - actual_response_date  - actual_response_date
     동시 기록)            - approval_status       - approval_status       - approval_status
  - organisation_raw
  - hdec_pic_name
  - hdec_eng_name

  Dates
  - submitted_date / approved_date

  Remarks (textarea, 전체 폭)

Card: Raw Payload (Aconex)
  raw_payload key/value를 읽기 전용 표시.
  `useDocsFieldConfig().getRawPayloadFieldsForDisplay()`가 있으면 그것을 사용,
  없으면 Defect 상세와 동일하게 전체 키를 80개로 잘라서 표시.

Card: Change History
  현재 도면의 `docs_change_log` 최신 50건 (Field / Old / New / Source / Changed At)
```

## 동작

- **로드**: 마운트 시 `id`로 `docs_drawings` 단건 조회 → `record` 와 편집용 `form` state 셋업.
- **권한**: Raw Data와 동일한 역할 체크 재사용 (`admin / superuser / senior_user / user` → 편집 가능). 권한 없으면 Save 숨김 + 모든 입력 disabled.
- **필드 가시성/라벨**: `useDocsFieldConfig().isFieldVisible(field)` / `getLabel(field)` 적용 — Defect/Subtest 상세와 동일 패턴.
- **Subcontractor Select**: `subcontractor_master`(active) 로드. 변경 시 `subcontractor_id` + `subcontractor_name` 동시 기록. 마스터에 없는 레거시 값은 보존(Defect와 동일).
- **Trade Select**: `@/lib/docs-trade`의 `TRADE_OPTIONS` 사용.
- **상태 Select**: `aconex_status`, `current_status`, `sub*_approval_status` 옵션은 현재 프로젝트의 `docs_drawings`에서 distinct 값을 모아 구성 (최대 5000행, Defect의 `suggestPool` 방식과 동일).
- **Boolean**: `is_submitted` 는 Yes/No Select.
- **저장 흐름**:
  1. `form`에서 `payload` 빌드 (빈 문자열은 null).
  2. `record` vs `form` diff하여 `changes` 배열 생성.
  3. `UPDATE docs_drawings SET ..., row_version = row_version + 1, updated_by = user.id, data_source_type = 'app_direct_input' WHERE id = record.id`.
  4. 변경된 필드별로 `docs_change_log`에 한 행씩 insert (`change_source = 'app_direct_input'`).
  5. record + change log 재조회 후 성공 토스트.
- **파생 표시(편집 불가)**:
  - `risk` → `computeRisk(...)` 컬러 뱃지
  - `overall_status` → `computeOverallStatus(...)` 뱃지
  - `days_due` → DB 값 그대로 표시

## Raw Data 페이지 행 클릭 연결

`src/pages/docs/DocsRawDataPage.tsx`의 `document_no` 셀을 클릭 가능하게 만들어 `navigate(\`/docs/\${row.id}\`)` 호출. 체크박스 클릭은 `stopPropagation`으로 분리.

## 수정 파일

**전면 교체:**
- `src/pages/docs/DocsDrawingDetailPage.tsx` — `DefectDetailPage.tsx` 구조를 기반으로 `docs_drawings` 컬럼에 맞게 작성 (대략 350줄). `Field`, `SelectField`, `ReadonlyField`, `toDateInput`, `formatMaybeDate` 헬퍼는 동일 패턴으로 로컬 정의.

**부분 수정:**
- `src/pages/docs/DocsRawDataPage.tsx` — `document_no` 셀에 행 이동 로직 추가.

**DB 마이그레이션 불필요** — `docs_drawings`에 모든 컬럼이 이미 존재하고, `docs_change_log` 테이블도 동일한 스키마/RLS로 이미 존재합니다.

## 범위 외 (추후)

- Comments 스레드 (`docs_comments` 테이블 미존재 → 별도 요청 시)
- 일정 변경 감사 (`docs_schedule_change_audit` 미존재 → 별도 요청 시)
- 저장 시 `current_status` / cycle progress 자동 재계산 — 현재는 사용자 입력 그대로 저장. import 로직이 진실 공급원으로 유지됨.
