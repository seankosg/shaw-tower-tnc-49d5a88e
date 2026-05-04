## 목표

ABD Raw Data 페이지의 일괄변경(Bulk Edit) 드롭다운에 docs_drawings의 모든 편집 가능한 필드를 추가합니다. Trade 필드는 현재 sheet_name에서 파생되는 값이라 일괄변경이 불가능했는데, 신규 DB 컬럼으로 도입하여 직접 편집 가능하게 만듭니다.

## 변경 사항

### 1) DB 마이그레이션

**`docs_drawings`에 `trade` 컬럼 추가** (text, nullable). 기본값은 NULL.

기존 4,803행에 대해 1회 백필: `sheet_name`에서 `getTradeFromSheetName()` 로직으로 trade를 계산해 채워넣습니다(문자열 매칭 SQL).

`docs_field_config`에 `trade` 필드를 등록(display_name="Trade", source_origin="system", visible/editable_to_roles 기존 분류 필드 패턴 따름).

`import_header_mappings`에 `docs/as_built` 모듈로 Trade alias 몇 개 추가(trade, work category 등) — 이후 import 시에도 컬럼이 있으면 사용되도록.

### 2) Trade 파생 로직 보존

`src/lib/docs-trade.ts`의 `getTradeFromSheetName()`은 그대로 두되, 컴포넌트들이 표시할 때 우선순위를 다음과 같이 변경:
- `row.trade`가 있으면 그 값을 표시(수동 override)
- 없으면 `getTradeFromSheetName(row.sheet_name)`로 파생

영향 받는 호출처 전수 확인 후 헬퍼 함수 `resolveTrade(row)`로 통일.

Import 파서(`src/lib/docs-import-parser.ts`)는 trade 컬럼이 입력에 있으면 그 값을 사용, 없으면 sheet_name에서 파생한 값으로 채워 저장하도록 수정.

### 3) 일괄변경 필드 목록 확장 (`DocsRawDataPage.tsx`의 `bulkFields`)

현재 28개 → 약 35개로 확장. 그룹별 정리:

```text
Classification:  discipline, document_type, trade(NEW), 
                 series(NEW), level_location(NEW), sequential_no(NEW)
Status:          aconex_status, current_status, is_submitted(NEW, Yes/No select)
Submission:      sub1/2/3_approval_status (기존)
Dates:           submitted_date, approved_date, transmittal_due_date (기존)
1st/2nd/3rd:     planned/submission/approval/actual_response_date 12개 (기존)
Notes:           revision, title, remarks, transmittal_number (기존)
Personnel:       subcontractor(NEW, master Select), 
                 organisation_raw(NEW, text), 
                 hdec_pic_name, hdec_eng_name (기존)
```

명시적으로 **제외**(일괄변경 부적합):
- `document_no` (unique key)
- `sheet_name`, `row_no` (import 메타)
- `is_active` (별도의 soft delete 액션으로 다룸 — 이 작업 범위 밖)
- `days_due` (자동 계산 — 추후 별도 논의)
- `subcontractor_id` 단독 (아래 Subcontractor 처리로 통합)

### 4) Subcontractor 처리 (특별 케이스)

`DocsBulkEditBar`에 새 inputType `'subcontractor_select'` 도입. `subcontractor_master`에서 `is_active=true`인 업체 목록을 옵션으로 로드. 사용자가 선택하면 `subcontractor_id`와 `subcontractor_name`을 한 번의 update로 함께 갱신.

`applyBulkUpdate`(`src/lib/bulk-edit.ts`)는 단일 필드만 받는 구조이므로, 멀티 필드 업데이트 분기를 추가하거나, Subcontractor 케이스 전용 핸들러를 BulkEditBar 내부에서 처리(분기 처리가 영향 최소).

### 5) `is_submitted` 처리

select inputType으로 옵션: `Yes` → true, `No` → false, `— Clear —` → null. `applyBulkUpdate`가 boolean 값을 받을 수 있도록 변환 로직(`'true'`/`'false'` 문자열 → boolean) 추가 필요.

### 6) 변경 추적

기존 `applyBulkUpdate`가 이미 `docs_change_log`에 변경을 기록하는지 확인하고, trade·subcontractor·is_submitted도 동일하게 로그되도록 보강.

## 기술 세부사항

**파일 변경**:
- 신규 마이그레이션: `docs_drawings.trade` 컬럼 추가 + 백필 + field_config seed + header_mappings seed
- `src/lib/docs-trade.ts` — `resolveTrade(row)` helper 추가
- `src/lib/bulk-edit.ts` — boolean 변환, multi-field update 분기
- `src/components/raw-data/DocsBulkEditBar.tsx` — `subcontractor_select` inputType, boolean select
- `src/pages/docs/DocsRawDataPage.tsx` — `bulkFields` 확장, subcontractor 옵션 로드
- `src/lib/docs-import-parser.ts` — trade 컬럼 인식 + sheet_name 파생 fallback
- Trade를 표시하는 모든 컴포넌트(Dashboard, Export, RawTable 등) — `resolveTrade(row)` 사용으로 교체

**검증 체크리스트**:
- 백필 후 기존 행에서 Trade 컬럼이 sheet_name 기반과 동일한 값을 가지는지 확인
- 일괄변경 드롭다운에 모든 신규 필드 노출 확인
- subcontractor 변경 시 id+name 동시 업데이트 확인
- is_submitted Yes/No/Clear 정상 동작 확인
- Import 시 trade 컬럼 없는 파일도 기존처럼 동작(sheet_name에서 파생)
- `docs_change_log`에 신규 필드 변경이 기록되는지 확인
