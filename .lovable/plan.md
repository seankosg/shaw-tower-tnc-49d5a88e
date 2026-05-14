## 목표
Spare Part Raw Data 페이지를 Defect Raw Data와 동등한 수준으로 풀포팅. TanStack Table 기반 가상화 테이블, 컬럼 단위 필터/표시·숨김/리사이즈/고정, URL 쿼리 동기화, 행 선택 + Bulk Edit, Subcontractor별 Excel/ZIP 분리 내보내기, Critical Pending 배너, 코멘트 메타 셀까지 모두 적용.

## 구현 범위 (Spare Part 도메인에 맞게 조정)

### 1. 도메인 어댑터 신규 작성
- `src/lib/spare-part-cache.ts` — `useSparePartCache`, `refreshSparePartCache`, `patchSparePartCacheLocal` (defect-cache 동일 패턴, `docs_spare_part` 대상).
- `src/lib/spare-part-utils.ts` — `SparePartItem` 타입, `formatPct`, `isOverdueSparePart`(planned_delivery_date < asOf && !actual_delivery_date), `RAW_SEARCH_FIELDS`, `SPARE_PART_RAW_FIELDS`.
- `src/lib/spare-part-status-utils.ts` — `isProcurementDelayedAsOf`, `isDeliveryComplete`, `isAtRisk` 등 PO/ETA/Delivery 기반 상태 헬퍼.
- `src/lib/spare-part-excel-export.ts` 확장 — `exportSparePartRawToExcel`, `exportSparePartRawToExcelBySubcontractor`, `exportSparePartRawToZipBySubcontractor` 추가 (8개 date 컬럼은 `excel-date-cell` 유지).

### 2. Bulk Edit 통합
- `src/lib/bulk-edit.ts`에 spare_part 도메인 추가: 편집 가능 필드 = `status`, `po_status`, `subcontractor_name`, `hdec_pic_name`, `hdec_eng_name`, `team`, `trade`, `material_lead_time`, 8개 date 컬럼, `remarks`.
- `BulkEditBar` 재사용 (props로 도메인/필드 메타 주입). 도메인 분기 필요 시 컴포넌트 내부에 `domain: 'defect' | 'spare_part'` 추가.

### 3. Stage / Progress 시각화
- Spare Part는 Defect의 T1/T2 단계가 없으므로 `DefectStageProgress` 대신 신규 `SparePartProcurementProgress` 컴포넌트 작성:
  - 단계: Confirm → Direction → PO → ETA → Delivery (planned vs actual 비교).
  - 동일한 칩/툴팁/컬러 토큰 스타일 사용.

### 4. RawDataPage 본체 (`src/pages/docs/DocsSparePartRawDataPage.tsx`) 재작성
- TanStack Table + virtualizer (`useReactTable`, `useVirtualizer`).
- ColumnDef 35개 (SystemMeta 5 포함). text/select/date/percent 필터 함수 재사용 (defect와 동일 함수 추출 또는 복사).
- URL `useSearchParams` 동기화: `q`, `cols`, `sort`, `f.<field>`, `selection`, `source`, `overdue`, `asOf`.
- Frozen column 수 = `useFrozenColumnCount()` 재사용.
- `CriticalPendingBar` — Spare Part 기준: ETA 지연 또는 Actual PO 미입력 + Planned PO 경과 항목 카운트.
- `TopHorizontalScrollbar`, MetaCell, 행 선택 체크박스, hover 액션 그대로.
- 모바일 레이아웃: 기존 카드 리스트 폴백 유지(`useIsMobile`).
- 권한 게이트: D.Super User 팀 제한, 일반 사용자 read-only Bulk 비활성.

### 5. 필터 칩 / 검색 / 내보내기 다이얼로그
- `buildColumnFilterChips` 재사용 (필드 라벨은 `useDocsFieldConfig`에서).
- Export 다이얼로그: All / By Subcontractor (Single sheet | Multi-sheet | ZIP, ZIP_THRESHOLD=7) 옵션 → 신규 export 함수 호출.

### 6. 상세/디테일 연동
- 행 클릭 시 `/docs/spare-part/:id` 그대로 유지. `?from=raw-data&q=...` 쿼리 보존.

## 작업 순서 (예상 파일)
1. `src/lib/spare-part-cache.ts` (신규)
2. `src/lib/spare-part-utils.ts` (신규)
3. `src/lib/spare-part-status-utils.ts` (신규)
4. `src/lib/spare-part-excel-export.ts` (확장)
5. `src/lib/bulk-edit.ts` (도메인 추가)
6. `src/components/raw-data/BulkEditBar.tsx` (도메인 분기)
7. `src/components/spare-parts/SparePartProcurementProgress.tsx` (신규)
8. `src/pages/docs/DocsSparePartRawDataPage.tsx` (전면 재작성, ~1200줄 예상)

## 기술 메모
- 가상화 테이블 행 높이: 36px (Defect와 동일).
- Date 컬럼 export 시 `setDateCell` + `DATE_NUMFMT` 유지 (이미 적용됨).
- Spare Part는 stage_progress 컬럼이 DB에 없으므로 진행률 컬럼은 procurement progress 계산값(0~100%, planned step 대비 actual 단계 수).
- `import_header_mappings` 시드는 이미 완료. 추가 작업 불필요.
- 작업량이 매우 크므로 각 파일은 독립적으로 작성하고, 마지막에 RawDataPage에서 통합. 빌드/타입 에러는 단계별로 수정.

## 사용자 확인 사항
- Procurement Progress의 단계 정의(Confirm→Direction→PO→ETA→Delivery)가 적절한지.
- Bulk Edit에서 date 8개 모두 일괄 수정 허용 여부 (잘못 수정 위험 큼 → 기본 OFF, 명시적 활성 필요?).
- Critical Pending 정의: 기본은 ETA 지연 + Planned PO 경과 미입력. 다른 기준 원하면 알려주세요.
