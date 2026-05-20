# Defect — Captured By 정규 필드화 + 대시보드 상단 통계 카드

## 1) Captured By를 정규 필드로 승격

현재 `Captured by`는 `defect_items.raw_payload` JSON 내에 저장되어 있고, `defect_field_config` 에서 `payload_captured_by` 라는 **동적(payload_)** 컬럼으로만 Raw Data에 노출되고 있음. 이를 일반 컬럼으로 승격.

### 작업
- **마이그레이션**
  - `defect_items` 에 `captured_by_name TEXT NULL` 컬럼 추가, 인덱스(`btree`) 생성
  - 기존 데이터 백필: `UPDATE defect_items SET captured_by_name = NULLIF(TRIM(raw_payload->>'Captured by'), '')`
  - `defect_field_config` 에서 기존 `payload_captured_by` 행을 제거하고 `captured_by_name` 정규 행을 추가 (display_name = "Captured By", source_origin = `aconex`, is_enabled = true, sort_order는 `hdec_eng_name` 직후)
- **Import 파이프라인 (`src/lib/defect-parser.ts`)**
  - 헤더 별칭 맵에 `'captured by' → 'captured_by_name'` 추가
  - 파싱 결과 객체에 `captured_by_name: toText(getMapped(raw, 'captured_by_name'))` 추가
  - `raw_payload` 에는 기존처럼 `Captured by` 원문도 그대로 유지
- **타입 / 라벨**
  - `DefectItem` 인터페이스에 `captured_by_name: string | null` 추가
  - `DEFECT_DEFAULT_FIELD_LABELS` 에 `captured_by_name: 'Captured By'` 추가
  - `DEFECT_RAW_FIELDS` (Raw Data 페이지 컬럼 정의)에 `captured_by_name` 추가 — 위치는 `hdec_eng_name` 다음
- 기존 dynamic `payload_captured_by` 컬럼은 `defect_field_config` 행 삭제로 자동 비활성

## 2) Defect Dashboard 상단 3개 배너 제거 + Captured By 통계 카드 추가

`src/pages/DefectDashboardPage.tsx` 의 399~405 라인 `<AlertBanner>` 3개 (Overdue / At-Risk / In Dispute) 블록을 삭제하고, 그 자리에 **Captured By 인물별 통계 카드 그리드** 를 배치.

### UX 사양
- 각 사람당 1개의 카드:
  - 제목: 인물 이름 (`captured_by_name`)
  - 4개 미니 metric: **Total** / **Completed** / **Closed** / **In Dispute**
  - 카드 클릭 시 Raw Data 로 이동하며 `?capturedBy=<name>` 파라미터 적용
  - 각 metric 숫자 클릭 시에는 해당 상태 필터까지 함께 적용 (`actualComplete=true`, `closureComplete=true`, `closureStatus=InD`)
- 정렬: Total 내림차순. `captured_by_name` 이 비어있는 항목은 별도 카드로 표시하지 않음
- 반응형: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`

### 권한
- **Guest 에게는 카드 영역 자체를 렌더링하지 않음**
- 판정: `useAuth()` 의 `roles` 를 사용해 `roles.includes('guest') || roles.includes('super_guest')` 이면 hide
- (정확히는 사용자 요구: "Guest" — `guest` role만 숨김. super_guest 포함 여부는 기존 가드 패턴 따라가되, 기본은 `guest`만 숨김)

### 집계 로직
- 클라이언트 캐시 (`useDefectCache`) 의 전체 defect 리스트를 `captured_by_name` 기준 groupBy
- Per-person 계산:
  - **Total**: 그룹 row 수
  - **Completed**: `isActualComplete(row)` true 개수
  - **Closed**: `isClosureComplete(row)` true 개수
  - **In Dispute**: `row.closure_status === 'InD'` 개수

### Raw Data 필터 연동
- `DefectRawDataPage` 의 query param 처리에 `capturedBy` 추가 → 컬럼 필터로 `captured_by_name` 에 적용
  - 기존 `closureStatus`, `actualComplete`, `closureComplete` 필터 패턴과 동일하게 처리

## 기술 메모

- 마이그레이션과 `defect_field_config` 행 변경은 단일 migration 으로 처리
- 정규 컬럼 추가 후 Raw Data 에서 이전 `payload_captured_by` 동적 컬럼은 자동 사라짐 (config 삭제로)
- Captured By 라벨/source는 기존 Aconex origin 유지 → 헤더 스타일이 일관됨
- Dashboard 카드 구현은 기존 `KpiCard` 와는 별도의 `CapturedByStatCard` 로 컴포넌트화하여 같은 파일 내 정의 (스타일 토큰은 `Card`, `Badge`, semantic color 사용)
