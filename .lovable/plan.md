

# Phase 2 전체 구현 계획

Phase 2는 5개 기능으로 구성됩니다. 모두 이번에 구현합니다.

---

## 1. Legacy Import 페이지 (`src/pages/ImportPage.tsx`)

Excel 파일 업로드 UI + 클라이언트 사이드 파싱 (SheetJS/xlsx 라이브러리 사용)

**Legacy Import 로직:**
- 1 row = 1 Test, MOS-1~5 컬럼을 분해하여 여러 Subtest 생성
- 헤더 정규화: 공백/줄바꿈 제거, 소문자 변환, 오타 대응 (`precessor status` → `predecessor_status_raw`)
- 헤더 매핑 테이블: System, Item No, Level, Equipment, Description, MOS-1~5, T1/T2 Planned/Status, Predecessor Status, Subcontractor, HDEC PIC
- Test 레벨 값(T1/T2, Predecessor, Subcontractor, HDEC PIC)은 모든 분해된 Subtest에 동일하게 복사
- Predecessor Status: 날짜값은 YYYY-MM-DD로 정규화, "Done"은 그대로 저장
- System 정규화: `system_alias_map` 조회 → 없으면 `system_master`에 `is_auto_created=true`, `requires_admin_review=true`로 자동 생성
- Subtest ID 생성: `{item_no}-{mos_code}`
- Upsert: business key(`project_id + system_id + item_no + mos_code`)로 매칭
  - 기존 레코드: `updated_at` 비교 → 최신이면 업데이트, 빈 셀은 기존 값 유지, `"clear"` 토큰이면 null로 설정
  - 새 레코드: insert
- `upload_batches` + `upload_row_logs`에 결과 기록
- `data_source_type = 'legacy_import_inherited'`

**UI:**
- 파일 드래그 앤 드롭 / 파일 선택
- Import Type 선택 (Legacy / Standard)
- 프리뷰 테이블 (파싱된 행 미리보기)
- Import 실행 버튼 + 진행 상태 표시
- 결과 요약 (inserted/updated/skipped/rejected 카운트)

## 2. Standard Import

같은 ImportPage 내에서 Import Type 토글로 전환

**Standard Import 로직:**
- 1 row = 1 Subtest (MOS 분해 없음)
- 동일한 헤더 정규화 + upsert 규칙 적용
- `data_source_type = 'standard_import'`

## 3. Import 로그 페이지 (`src/pages/ImportLogsPage.tsx`)

- `upload_batches` 목록 테이블 (파일명, 시간, 상태, 통계)
- 행 클릭 시 `upload_row_logs` 상세 (행번호, system, item_no, mos_code, action, reason)

## 4. Excel Export (`src/pages/ExportPage.tsx`)

- SheetJS로 클라이언트 사이드 Excel 생성
- 현재 필터 조건 반영 (시스템, 상태)
- 포함 컬럼: System, Item No, Equipment, Subtest ID, MOS Code, Description, Predecessor Status, T1 Planned, T1 Status, T2 Planned, T2 Status, Subcontractor, HDEC PIC, Source, Updated
- 파일명: `SHAW_TC_Export_{날짜}.xlsx`

## 5. Mobile Quick Update 페이지 (`src/pages/MobileUpdatePage.tsx`)

- Subtest 검색 (ID 또는 Item No)
- 카드형 UI로 T1/T2 Status 빠른 변경
- Predecessor, Subcontractor, HDEC PIC 표시/편집
- `data_source_type = 'mobile_input'`

---

## 수정 파일 요약

| 파일 | 작업 |
|------|------|
| `package.json` | `xlsx` (SheetJS) 패키지 추가 |
| `src/pages/ImportPage.tsx` | 새 파일 — Legacy/Standard Import UI + 파서 |
| `src/pages/ImportLogsPage.tsx` | 새 파일 — Import 이력/로그 조회 |
| `src/pages/ExportPage.tsx` | 새 파일 — Excel Export |
| `src/pages/MobileUpdatePage.tsx` | 새 파일 — Mobile Quick Update |
| `src/lib/import-parser.ts` | 새 파일 — 헤더 정규화, Legacy/Standard 파싱 로직 |
| `src/App.tsx` | 라우트 추가 (`/import`, `/export`, `/mobile`) |
| `src/components/layout/AppSidebar.tsx` | Mobile Quick Update 네비 추가 |

## 기술 사항

- **SheetJS (`xlsx`)**: 클라이언트 사이드 Excel 파싱/생성. 서버 불필요.
- **Import 파서**는 별도 유틸 파일로 분리하여 테스트 가능하게 구성
- 인증 비활성 상태이므로 `uploaded_by`, `changed_by`, `updated_by`는 null로 처리
- 기존 DB 스키마 변경 없음 (모든 필요한 컬럼/테이블 이미 존재)

