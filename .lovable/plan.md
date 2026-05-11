# Warranty Reimport 헤더 매핑 점검 보고

## 1. 점검 배경

업로드한 `SHAW_Warranty_reimport_20260508_1915_update.xlsx`의 8행에 있는 24개 컬럼 헤더가
- `docs_field_config` (Field Config) 의 `display_name`
- `import_header_mappings` (Header Mapping) 의 `header_alias`
양쪽과 일치하는지를 검증했습니다.

핵심 결과: **이 export 파일은 docs_field_config.display_name 기준으로 헤더를 만들지만, import_header_mappings에는 동일한 alias가 거의 등록돼 있지 않아 24개 중 14개가 미매핑(unmapped) → 임포트 시 무시됩니다.**

또한 warranty parser(`docs-warranty-import-parser.ts`)는 DB lookup을 **대소문자 구분(case-sensitive)** 으로 수행하기 때문에, 같은 의미의 alias가 소문자로만 등록돼 있어도 매칭 실패합니다 (다른 모듈 OMM/ABD/Spare-part는 정규화 후 lookup → 일관성 결여).

## 2. 헤더별 매핑 진단

| # | 파일 헤더 | field_config display_name | header_mappings (active) | 결과 |
|---|---|---|---|---|
| 1 | ID | (없음 · reimport 시스템열) | — | 파서가 무시 (특수 처리 없음) |
| 2 | No | No → item_no | `No` | OK |
| 3 | Resubmission Seq | (없음 · reimport 시스템열) | — | 파서가 무시 |
| 4 | Category | Category | `Category` | OK |
| 5 | Warranted Item | Warranted Item | `Warranted Item` | OK |
| 6 | Team | Team | `Team` | OK |
| 7 | **Subcontractor** | Subcontractor | `[R] Subcontractor`만 존재 | **미매핑** |
| 8 | HDEC PIC | HDEC PIC | `HDEC PIC` | OK |
| 9 | HDEC ENG | HDEC ENG | `HDEC ENG` | OK |
| 10 | **Warranty Years** | Warranty Years | `Warranty Period Years`만 존재 | **미매핑** |
| 11 | **Subcontract Date** | Subcontract Date | `[R] Subcontract Contract Date`만 | **미매핑** |
| 12 | **Draft Planned** | Draft Planned | 소문자 `draft planned` / `D. Planned Submission` | **미매핑** (case-sensitive) |
| 13 | **Draft Actual** | Draft Actual | 소문자 `draft actual` / `D. Actual Submission` | **미매핑** |
| 14 | **Draft Status** | Draft Status | 소문자 `draft status` / `D.Status` | **미매핑** |
| 15 | **Subcon Sign Planned** | Subcon Sign Planned | 소문자 `subcon sign planned` / `Subcon Planned Signing` | **미매핑** |
| 16 | **Subcon Sign Actual** | Subcon Sign Actual | 소문자만 | **미매핑** |
| 17 | **Subcon Sign Status** | Subcon Sign Status | `Subcon Signing Status`(is_active=false), 소문자만 | **미매핑** |
| 18 | **HDEC Sign Planned** | HDEC Sign Planned | 소문자만 / `HDEC Planned Signing` | **미매핑** |
| 19 | **HDEC Sign Actual** | HDEC Sign Actual | 소문자만 / `HDEC Actual Signing` | **미매핑** |
| 20 | **HDEC Sign Status** | HDEC Sign Status | 소문자만 / `HDEC Siging Status`(오타) | **미매핑** |
| 21 | **Final Planned** | Final Planned | 소문자 / `Final Planned Submission` | **미매핑** |
| 22 | **Final Actual** | Final Actual | 소문자 / `Final Actual Submission` | **미매핑** |
| 23 | Final Status | Final Status | `Final Status` | OK |
| 24 | Remarks | Remarks | `Remarks` | OK |

**정상 10개 / 미매핑 12개 / 시스템열 2개**.

실제로 import을 실행하면 12개 본문 컬럼(서브콘트랙터, 워런티 기간, 5개 단계의 일자/스테이터스 8개)이 통째로 누락되어, 사실상 `No · Category · Warranted Item · Team · HDEC PIC/ENG · Final Status · Remarks`만 갱신되는 비정상 결과가 됩니다.

## 3. 원인 요약

1. **Round-trip 미보장**: `warranty-excel-export.ts`는 `docs_field_config.display_name`을 헤더로 출력하지만, 그 display_name이 `import_header_mappings`에 alias로 시드되어 있지 않습니다.
2. **대소문자 비대칭**: warranty parser만 `getMappedField('docs', raw, 'warranty')`에서 `raw`(원본 케이스)로 lookup → DB에 소문자 alias만 있으면 실패. (omm/abd/spare_part 파서는 normalize 후 lookup)
3. **ID / Resubmission Seq 미사용**: 파일 1·3열은 파서가 인지하지 않아 reimport임에도 항상 `item_no`로 upsert됨. (별도 이슈; 본 점검 범위 외)

## 4. 개선 계획

### Step 1 — Parser 수정 (`src/lib/docs-warranty-import-parser.ts`)
- `mapHeader()`에서 lookup을 두 단계로 정규화:
  ```ts
  const norm = normalizeHeader(raw);   // 공백/줄바꿈 정리
  const db = getMappedField('docs', norm, 'warranty')
          ?? getMappedField('docs', norm.toLowerCase(), 'warranty');
  ```
- `FALLBACK_ALIASES` lookup도 동일하게 `norm.toLowerCase()` 사용.
- 결과: header_mappings의 alias가 소문자로만 등록돼 있어도 매칭됨 → 다른 모듈과 동일한 동작.

### Step 2 — Header Mapping 시드 보강 (Migration: `import_header_mappings` insert)
다음 alias들을 `module='docs', sub_module='warranty', is_active=true, is_system=true`로 추가 (UNIQUE 충돌 시 무시):

| header_alias | target_field |
|---|---|
| Subcontractor | subcontractor_name |
| Warranty Years | warranty_period_years |
| Subcontract Date | r_subcontract_date |
| Draft Planned | draft_planned_date |
| Draft Actual | draft_actual_date |
| Draft Status | draft_status |
| Subcon Sign Planned | subcon_signing_planned_date |
| Subcon Sign Actual | subcon_signing_actual_date |
| Subcon Sign Status | subcon_signing_status |
| HDEC Sign Planned | hdec_signing_planned_date |
| HDEC Sign Actual | hdec_signing_actual_date |
| HDEC Sign Status | hdec_signing_status |
| Final Planned | final_planned_date |
| Final Actual | final_actual_date |

추가로 비활성 상태인 `Subcon Signing Status`(현재 is_active=false)도 활성화 또는 정리.
완료 후 `app_settings.header_mappings_version`을 +1 하여 클라이언트 캐시 무효화.

### Step 3 — Field Config ↔ Header Mapping 동기화 가드 (선택)
Admin Tab에서 docs_field_config 의 display_name이 변경될 때, 같은 (module, sub_module, target_field) 의 alias가 하나 이상 매칭되는지 확인하는 Lint 화면을 추가 (이번 작업 범위 외, 후속 옵션).

## 5. 예상 효과

- 본 첨부 파일을 다시 import하면 24개 헤더 중 22개가 정상 매핑(시스템 ID/Seq 2개 제외)되어, 모든 단계 일자/스테이터스/서브콘트랙터/워런티 기간이 올바르게 갱신됩니다.
- 이후 export → 수정 → reimport round-trip이 무결합으로 보장됩니다.
- OMM/ABD/Spare Part 파서와 동일한 대소문자 무시 정책으로 일관성 확보.

## 기술 노트 (개발자용)

- `normalizeHeader()` 는 이미 parser 내에 존재 — `mapHeader` 진입 시점에 `raw`가 trim만 되므로 normalize+lower 적용 위치만 보강하면 됨.
- 캐시(`header-mappings-cache.ts`)의 키는 alias 원형으로 저장 → 캐시 빌드 시 `aliasNorm = normalizeHeader(r.header_alias).toLowerCase()` 키도 함께 저장하면 lookup 한 번으로 충분. 또는 parser 측에서 두 번 시도. 후자는 변경 범위가 작아 권장.
- ID/Resubmission Seq를 사용한 정밀 reimport(같은 item_no라도 resubmission별로 분리 갱신)는 별도 Phase로 분리. 현재 warranty 스키마는 `parent_id` 계층은 있으나 Resubmission Seq를 키로 다루지 않음.

진행해도 괜찮으실까요? Step 1 + Step 2를 한 번에 적용하면 첨부 파일이 바로 정상 import 됩니다.
