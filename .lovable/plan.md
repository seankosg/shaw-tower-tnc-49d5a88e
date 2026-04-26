## 목표

Defect 필드의 출처(Origin)를 **HDEC / Aconex / System** 3가지로 재분류하고, Admin 탭에서 드롭다운으로 수정 가능하게 합니다. 또한 raw_payload로만 들어오는 Aconex 원본 필드들도 `defect_field_config`에 등록하여 관리·표시합니다.

---

## 1. Origin 분류 체계

### 라벨 체계
- `'hdec'` → **HDEC**
- `'aconex'` → **Aconex**
- `'system'` → **System**

내부 enum 값을 3개로 통일 (기존 4개 값 `ll_original`/`hdec_added`/`system`/`derived`은 데이터 마이그레이션으로 일괄 변환).

### 필드별 최종 분류

**HDEC** — 사용자(HDEC)가 직접 입력/관리
- 담당자: `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
- 일자 6종: `planned_start_date`, `planned_completion_date`, `planned_closure_date`, `actual_start_date`, `actual_completion_date`, `actual_closure_date`
- 진행률 입력: `actual_progress_pct`
- 코멘트: `hdec_comments`

**Aconex** — LL/Aconex 원본
- DB 매핑됨: `issue_no`, `area_raw`, `description`, `defect_type`, `priority`, `trade_detail`, `status`, `remarks`
- raw_payload 전용 (15개 신규 등록): `Date Raised`, `Captured On`, `Captured by`, `Source`, `Listed In`, `Pinned To DocNumber`, `Doc Title`, `Date Closed`, `Due Date`, `Assigned to`, `Assigned On`, `Assigned By`, `Closed By User`, `Closed By Organization`, `Item Description`

**System** — 시스템이 계산/판별/생성/파생
- 계산: `planned_progress_pct`, `completion_status`, `closure_status`
- 영역 파생: `area_type`, `area_level`, `area_location` (← `area_raw` 파싱)
- 자동 분류 결과: `main_trade`, `sub_trade`, `work_type`, `classification_source`, `classified_at`
- 자동 판별: `team` (subcontractor 마스터 조회)
- 자동 생성/판별: `subcontractor_issue_no`, `subcontractor_issue_source` (`SC-{OWNER}-{SEQ}` 자동 생성)

---

## 2. DB 변경

### A. 기존 행 일괄 업데이트 (`defect_field_config.source_origin`)
위 분류표대로 모든 행의 `source_origin`을 `'aconex' | 'hdec' | 'system'` 3개 값으로 일괄 변환.

### B. raw_payload 전용 Aconex 필드 신규 등록 (15개 INSERT)
- `field_name`: `payload_` 접두사 + snake_case (예: `payload_date_raised`)
- `display_name`: 원본 헤더 그대로 (예: "Date Raised")
- `original_header`: 원본 엑셀 헤더 (raw_payload 키와 매칭용)
- `source_origin`: `'aconex'`
- `is_enabled`: true (기본 표시)
- `is_required`: false
- `sort_order`: 기존 최대값 이후 순차 배치 (1000~)

---

## 3. Admin UI 변경 (`AdminPage.tsx`)

`FieldConfigTable`의 "Origin" 컬럼:
- **읽기 전용 텍스트 → Select 드롭다운**으로 변경 (HDEC / Aconex / System 3개 옵션)
- 변경 시 `defect_field_config.source_origin` 즉시 업데이트 + toast
- 기존 값(`ll_original`, `hdec_added`, `derived`)이 들어와도 표시 시 신규 라벨에 매핑 (방어적 처리)

---

## 4. UI 표기 일관화

### `useDefectFieldConfig.ts`
- `SOURCE_LABELS` 상수 추가: `{ hdec: 'HDEC', aconex: 'Aconex', system: 'System' }`
- `getSourceLabel(fieldName)` 헬퍼 export
- `getRawPayloadFieldsForDisplay()` 헬퍼 추가 (`payload_*` 필드를 원본 헤더와 매칭하여 반환)

### `ColumnSelectDialog.tsx`
- "Maps to Field" 옆에 작은 **Source 배지** (HDEC / Aconex / System) 표시

### Defect Detail 페이지 — Raw Payload 섹션
- `defect_field_config`의 `payload_*` 행 기반으로 렌더링:
  - 사용자 친화적 라벨 표시 (`display_name`)
  - **Source 배지** 표시 (Aconex)
  - `is_enabled = false`인 필드는 숨김 (Admin이 가시성 제어 가능)

---

## 기술 세부사항

**파일 변경:**
- `src/pages/AdminPage.tsx` — Origin 셀을 Select 드롭다운으로 교체
- `src/hooks/useDefectFieldConfig.ts` — `SOURCE_LABELS`, `getSourceLabel`, `getRawPayloadFieldsForDisplay` 추가
- `src/lib/defect-parser.ts` — `DefectFieldOrigin` union을 `'aconex' | 'hdec' | 'system'`로 갱신 (하위 호환 위해 기존 값도 union에 임시 유지)
- `src/components/import/ColumnSelectDialog.tsx` — Source 배지 추가
- `src/pages/DefectDetailPage.tsx` — Raw Payload 섹션을 field_config 기반으로 리팩터링

**DB 작업 (insert 도구로 수행):**
1. 기존 34개 행 `source_origin` 일괄 업데이트 (4개 값 → 3개 값)
2. raw_payload 전용 15개 행 INSERT

**범위 제외:**
- T&C(`field_config`) 테이블에는 `source_origin` 컬럼이 없으므로 이번 작업 범위 외
