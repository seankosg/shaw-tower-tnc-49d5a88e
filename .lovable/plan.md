
# Docs 모듈 Raw Data 구축 계획

Docs 모듈은 4개 sub-module로 구성됩니다:
1. **As-Built** (준공도면)
2. **OMM** (O&M Manual)
3. **Warranty** (보증서)
4. **Spare Part** (예비품 리스트)

사용자 결정 사항:
- 데이터 구조: **B. 분리 테이블** (sub_module별 신규 raw 테이블)
- 우선순위: **As-Built 먼저 → 검증 → OMM → Warranty → Spare Part**
- Spare Part 컬럼: 사용자가 **샘플 엑셀 제공 예정** → 수령 후 확정

---

## Phase A. As-Built Import 정상화 (이번 단계)

현재 Docs Import가 동작하지 않는 원인을 제거하고 As-Built Raw Data가 채워지도록 합니다.

### A1. RLS 정책 수정 (DB Migration)
`docs_drawings` / `docs_upload_batches` / `docs_upload_row_logs` / `docs_change_log`의 INSERT·UPDATE 정책이 존재하지 않는 역할(`senior_user`, `user`)을 참조하고 있어 모든 일반 사용자의 import가 차단됨. 실제 프로젝트 역할 체계(`admin`, `superuser`, `manager`, `hdec_engineer`, `subcontractor`)에 맞춰 갱신.

```sql
-- 예시
DROP POLICY "Users can insert docs drawings" ON public.docs_drawings;
CREATE POLICY "Users can insert docs drawings"
  ON public.docs_drawings FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(),
      ARRAY['admin','superuser','manager','hdec_engineer']::app_role[])
  );
-- UPDATE 정책도 동일하게 갱신
```

### A2. DocsImportContext 개선
- `getDefaultProject()`가 활성 프로젝트 0개·2개 이상일 때 조용히 실패 → 명시적 에러 throw + UI 노출
- Supabase 응답의 `error.code` / `error.message` / `details` / `hint`를 swallow하지 않고 그대로 상태에 보관
- Import 시작 전 pre-flight 권한 체크(현재 사용자 role 조회) → 권한 없으면 업로드 단계 진입 자체 차단

### A3. DocsImportPage 진단 UI
- Pre-import 검증 카드: 빈 Document No 행 수, 매핑 안 된 Organisation 수, 중복 행 수 표시
- Import 실패 시 결과 카드에 `error.code` + `reason_detail` + 첫 5행 원인을 노출
- `docs_upload_row_logs`로 들어간 거절·스킵 사유를 모달에서 즉시 확인 가능

### A4. 검증
- 샘플 As-Built 엑셀로 import 실행 → `docs_drawings` 행 생성 확인
- Raw Data 페이지(`/docs/raw-data` 등)에서 즉시 노출되는지 확인
- `docs_upload_batches.status='completed'` 및 `success_rows` 정합성 확인

---

## Phase B. OMM Raw Data (As-Built 검증 후)

### B1. 신규 테이블 `docs_omm_items`
공통 필드 + OMM 고유 필드 분리.
- 공통: `id`, `project_id`, `document_no`, `revision`, `title`, `subcontractor_id`, `organisation_raw`, `discipline`, `aconex_status`, `submitted_date`, `approved_date`, `is_submitted`, `remarks`, `raw_payload`, `custom_payload`, `source_upload_id`, `row_version`, `is_active`, audit
- OMM 고유: `manual_type` (Operation / Maintenance / Both), `equipment_tag`, `system_code`, `volume_no`, `language`, `final_submission_date`

### B2. 공유 인프라 재사용
`docs_upload_batches` / `docs_upload_row_logs` / `docs_change_log`에 이미 있는 `sub_module` 컬럼을 discriminator로 사용. 별도 batch 테이블 추가하지 않음.

### B3. UI
- Import 페이지에 sub-module 탭(As-Built / OMM / Warranty / Spare Part) 추가
- Raw Data 페이지에 OMM 탭 + 컬럼 프리셋
- `import_header_mappings`에 `sub_module='omm'` 행 시드

---

## Phase C. Warranty Raw Data

### C1. 신규 테이블 `docs_warranty_items`
- 공통 필드(B1과 동일 구조)
- Warranty 고유: `warranty_start_date`, `warranty_expiry_date`, `warranty_period_months`, `warranty_type` (Material / Workmanship / System), `vendor_name`, `equipment_tag`, `claim_contact`, `coverage_scope`

### C2. UI / 매핑 / 검증
- Phase B와 동일한 패턴으로 탭, 헤더 매핑, Raw Data 뷰 추가
- `warranty_expiry_date` 기준 만료 임박 카운트 등 간단 KPI는 후속 단계에서 검토

---

## Phase D. Spare Part Raw Data (샘플 엑셀 수령 후)

사용자가 제공할 샘플 엑셀을 수령한 뒤:
1. 헤더 분석 → 정식 컬럼과 `custom_payload` 잔여 필드 분류
2. `docs_spare_part_items` 테이블 마이그레이션 생성
3. `import_header_mappings` 시드 자동 생성
4. Phase B/C와 동일 UI 패턴 적용

샘플 수령 전까지 D는 착수하지 않습니다.

---

## 영향 받는 파일 (Phase A 한정)

- `supabase/migrations/<new>.sql` — RLS 4개 테이블 정책 교체
- `src/contexts/DocsImportContext.tsx` — 에러 전파, 프로젝트 가드, pre-flight
- `src/pages/docs/DocsImportPage.tsx` — 진단 UI, 결과 카드 details
- (필요 시) `src/lib/docs/import/*` — 에러 객체 형태 통일

---

## 진행 순서 제안

1. **지금**: Phase A 전체 실행 → As-Built import 정상화·검증
2. **검증 OK 후**: Phase B(OMM) 착수
3. **B 완료 후**: Phase C(Warranty)
4. **샘플 엑셀 수령 후**: Phase D(Spare Part)

이 plan으로 진행하면 default mode로 전환해 Phase A부터 바로 구현하겠습니다.
