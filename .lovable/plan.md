## Warranty Raw Data 구현 계획

### 배경
- 업로드된 `STR-List_of_Warranties` 시트 분석:
  - 헤더 행 = 7행, 데이터 = 8~158행 (No 0 ~ 181), 카테고리 8종 (ACMV, Architectural, C&S, Electrical, FP, Lift, Misc, SPG).
  - 38개 의미있는 컬럼: 기본정보 + 협력사정보(ACRA) + Draft/Subcon Sign/HDEC Sign/Final 4단계 일정 + 5개 Tread(thread) 협의 컬럼.
- 기존 `warranty` 관련 테이블 6개는 모두 비어있음 → **전부 DROP 후 새로 설계**.
- 사이드바·라우트·HeaderMappings에 placeholder는 이미 등록되어 있음 → 본격 구현으로 교체.

### 필드 매핑 (엑셀 → DB)

```
No                                              → item_no            (PK 식별자, 0~181)
Category                                        → category           (ACMV, C&S, …)
Warranted Item                                  → warranted_item
Team                                            → team               (team_type enum)
HDEC PIC                                        → hdec_pic_name      (hdec_pic_master 연계)
HDEC ENG                                        → hdec_eng_name      (hdec_eng_master 연계)
Warranty Period Years                           → warranty_period_years (int)
Contract Specification Reference                → contract_spec_ref
[R] Description of the Works                    → r_works_description       ┐
[R] Subcontractor                               → subcontractor_name        │
[R] Subcontractor Company Reg No "ACRA"         → r_acra_reg_no             │ Schedule R 정보
[R] Subcontractor registered office address     → r_acra_address            │ → 자동으로
[R] Subcontract Contract Date                   → r_subcontract_date        │ subcontractor_info_master에
[R] Brief Description                           → r_brief_description       │ 동기화
[R] 1st Authorised Director                     → r_director_1              │
[R] 2nd Authorised Director / Secretary         → r_director_2              │
[R] Witness                                     → r_witness                 ┘
ACRA Info                                       → acra_info_status (boolean/text)
D. Planned/Actual Submission, Planned/Actual Response, D.Status
                                                → draft_planned_date, draft_actual_date,
                                                  draft_response_planned_date, draft_response_actual_date,
                                                  draft_status (Status enum)
Subcon Planned/Actual Signing, Subcon Signing Status
                                                → subcon_signing_planned_date, subcon_signing_actual_date,
                                                  subcon_signing_status
HDEC Planned/Actual Signing, HDEC Signing Status
                                                → hdec_signing_planned_date, hdec_signing_actual_date,
                                                  hdec_signing_status
Final Planned/Actual Submission, Final Status   → final_planned_date, final_actual_date, final_status
Tread 1, 2-1, 2-2 (Action party), 2-3, 3-1, 3-2 → 모두 warranty_thread 자식 테이블에
                                                  date(헤더에서 파싱) + party + content 형태로 저장
```

### 새 데이터 모델 (마이그레이션 1개)

**기존 6개 warranty* 테이블 DROP CASCADE.**

신규 테이블:

1. **`subcontractor_info_master`** — 다른 모듈에서도 재사용 가능한 협력사 상세 마스터
   - `id uuid PK`, `subcontractor_id uuid` (subcontractor_master FK, unique)
   - `acra_reg_no text`, `acra_address text`, `acra_info_verified boolean`
   - `default_director_1 text`, `default_director_2 text`, `default_witness text`
   - `last_subcontract_date date`, `notes text`
   - `created_at`, `updated_at`, `updated_by`
   - RLS: read = authenticated, write = admin/superuser/d_superuser
   - **워런티 import 시 ACRA 컬럼 값으로 upsert**

2. **`warranty_items`** (메인, item_no 기반 식별)
   - `id uuid PK`, `project_id`, `item_no int NOT NULL` (unique per project)
   - 기본정보: `category`, `warranted_item`, `team team_type`, `warranty_period_years`, `contract_spec_ref`
   - 책임자: `subcontractor_name`, `subcontractor_id`(FK), `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
   - Schedule R: `r_works_description`, `r_acra_reg_no`, `r_acra_address`, `r_subcontract_date`, `r_brief_description`, `r_director_1`, `r_director_2`, `r_witness`, `acra_info_status text`
   - Draft: `draft_planned_date`, `draft_actual_date`, `draft_response_planned_date`, `draft_response_actual_date`, `draft_status warranty_status`
   - Subcon Signing: `subcon_signing_planned_date`, `subcon_signing_actual_date`, `subcon_signing_status warranty_status`
   - HDEC Signing: `hdec_signing_planned_date`, `hdec_signing_actual_date`, `hdec_signing_status warranty_status`
   - Final: `final_planned_date`, `final_actual_date`, `final_status warranty_status`
   - 파생: `current_stage text` (Draft/Subcon Sign/HDEC Sign/Final/Closed), `current_status text`
   - 재제출 (OMM 패턴): `parent_id uuid`, `is_resubmission boolean`, `resubmission_seq int`
   - 공통: `remarks`, `custom_payload jsonb`, `raw_payload jsonb`, `data_source_type`, `source_upload_id`, `is_active`, `row_version`, `created_at/by`, `updated_at/by`
   - **UNIQUE (project_id, item_no)** WHERE is_active AND parent_id IS NULL

3. **`warranty_status` enum**: `'A','B','C','UR','WIP','Planned'`

4. **`warranty_threads`** — 시점순 통합 협의 기록
   - `id uuid PK`, `warranty_item_id uuid FK ON DELETE CASCADE`, `project_id`
   - `thread_date date`, `thread_label text` (e.g. "Tread 1 LL/HDEC", "Tread 2-2 Action Party"), `action_party text`, `content text`
   - `sort_order int` (시점순), `source_upload_id`, `created_at`, `updated_at/by`
   - RLS: read = authenticated, write = admin/superuser/d_superuser/senior_user

5. **`warranty_change_log`** (Defect 패턴 동일): `warranty_item_id`, `changed_field`, `old/new_value`, `changed_at/by`, `change_source`, `upload_id`

6. **`warranty_upload_batches`**, **`warranty_upload_row_logs`** (OMM/Defect 패턴 동일)

7. **트리거 & 함수**:
   - `compute_warranty_stage_status(row)` — current_stage/current_status 계산 (final A → Closed, hdec_signing A → Final, subcon_signing A → HDEC Sign, draft A → Subcon Sign, …)
   - `warranty_status_refresh` BEFORE INSERT/UPDATE
   - `warranty_after_update_resubmit` — **draft_status / subcon_signing_status / hdec_signing_status / final_status 가 B 또는 C 가 되면 신규 행 생성** (OMM `create_omm_resubmission` 패턴 그대로)
   - `update_updated_at_column` 재사용
   - `fn_event_log_record` 부착 (audit)
   - cascade delete RPC: `delete_warranty_cascade(_ids uuid[])` (Defect 패턴)

### 헤더 매핑 (HeaderMappingsTab)

`HeaderMappingsTab.tsx` 의 `DOCS_WARRANTY_FIELDS` 를 새 스키마 필드로 교체. 업로드 엑셀 헤더 → DB 필드 기본 매핑 시드(20260417 시드 패턴) 마이그레이션 추가.

### Import 파이프라인

`DocsImportPage.tsx` 의 Warranty 탭을 활성화. OMM 임포터 구조를 그대로 복제한 `warranty-import.ts` 추가:
- `item_no` 기준 upsert
- Schedule R 컬럼 → `subcontractor_info_master` 자동 upsert (값이 다르면 `warranty_acra_conflict_queue` 대신 단순 갱신; 충돌 큐는 본 단계에서 제외)
- Tread 컬럼들 → 헤더 텍스트에서 날짜·라벨·action party 파싱 후 `warranty_threads` 에 sort_order 부여하여 insert (재실행 시 (item_no, thread_label) 기준 upsert)
- `warranty_upload_batches` / `warranty_upload_row_logs` 기록
- `warranty_change_log` 기록 (excel_import source)

### Raw Data 페이지 (`DocsWarrantyRawDataPage.tsx` 재작성)

Defect Raw Data 의 모든 기능 + OMM 패턴 결합:
- TanStack Table + virtualization, frozen columns, 컬럼 표시/숨김, 정렬, 다중 선택 필터, 텍스트/숫자/날짜 범위 필터, 칩 필터, top horizontal scrollbar
- 행 클릭 → `/docs/warranty/:id` 상세 페이지 (Schedule R 패널 + 4단계 일정 + Threads 타임라인 + Change Log + Comments — Defect Detail 패턴)
- 행 인라인 편집 (status 셀 등), Bulk action bar (status 일괄, hdec_pic 일괄 등)
- Excel export (현재 필터된 뷰), 컬럼 폭/순서 영속, 모바일 반응형
- Status 셀 → `warranty_status` 6값 색상 배지 (A=초록, B=노랑, C=주황, UR=파랑, WIP=보라, Planned=회색)
- Cycle progress (Draft → Subcon Sign → HDEC Sign → Final) — `OmmCycleProgress` 변형
- Cascade delete (admin/superuser), 재제출 자동생성 행은 시각적으로 들여쓰기

### Subcontractor Information Master UI (Admin)

`AdminPage.tsx` Subcontractor 탭 옆에 신규 서브탭 또는 row expand:
- subcontractor_master 행 클릭 시 `subcontractor_info_master` 1:1 레코드 편집 (ACRA Reg No, ACRA Address, Default Director 1/2, Default Witness, Last Subcontract Date, Notes, ACRA Verified 토글)
- 워런티 import 가 자동으로 채운 값을 admin 이 검증/수정
- 향후 다른 모듈(예: 계약, 보험)에서 동일 마스터 참조

### 라우트/사이드바
이미 등록되어 있음:
- `/docs/warranty` (Raw Data) — 새 페이지로 교체
- 신규 추가: `/docs/warranty/:id` → `DocsWarrantyDetailPage` (Defect Detail 패턴)
- 사이드바 라벨 그대로 유지 ("Raw Data Warranty")

### 권한
`role-permissions.ts` 의 `/^\/docs\/warranty(\/|$)/` 패턴 그대로 사용 (super_guest+ 조회). RLS 는 OMM/Defect 와 동일 패턴 (admin/superuser 전체, d_superuser 자기 팀, senior_user 자기 팀, 기타 view only).

### 구현 순서

1. **마이그레이션 #1** — 기존 warranty* 6개 테이블 DROP, 신규 테이블/enum/트리거/RPC 생성, RLS, 헤더매핑 시드.
2. **types 자동 재생성** 후 `HeaderMappingsTab` 의 DOCS_WARRANTY_FIELDS 갱신.
3. **Import 파서** (`src/lib/docs-import/warranty-parser.ts`) + `DocsImportPage` Warranty 탭 활성화.
4. **`DocsWarrantyRawDataPage.tsx` 전면 재작성** (Defect+OMM 패턴 결합).
5. **`DocsWarrantyDetailPage.tsx` 신규** (Schedule R + Stages + Threads + Change Log + Comments) + App.tsx 라우트 추가.
6. **Subcontractor Information Master** — Admin 페이지에 편집 UI 추가 (`AdminPage.tsx` Masters 탭 확장).
7. **재제출 트리거 & B/C 신규행 생성** 검증 (테스트 데이터 입력 후 동작 확인).

### 비고
- 사용자 업로드 파일은 macOS 메타데이터 prefix(`._`)가 붙어있지만 정상 xlsx 였습니다 — 그대로 사용 가능.
- 기존 `warranty_acra_conflict_queue` 패턴은 본 단계에서 제외(요청에 없음). 필요해지면 후속 작업으로.
- "OMM과 비슷" 라는 사용자 지시에 따라 Status B/C → 신규행 자동생성, response/approval 일자 자동상태 업데이트 등 OMM 트리거 로직을 그대로 이식.
