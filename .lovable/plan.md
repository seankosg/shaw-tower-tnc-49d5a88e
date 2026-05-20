# Record Export 탭 추가

Admin > Report 페이지에 `Record Export` 탭을 신규 추가하고, Raw data 기반 Subcontractor 일일/누계 실적을 엑셀로 내보내는 기능을 구현합니다.

## 범위

대상 모듈: **T&C**, **Defect** 2종.
계획/실적 기준:
- T&C: T1 planned_date / T1 actual_date, T2 planned_date / T2 actual_date (Subtest 단위)
- Defect: planned_completion_date / actual_completion_date (Defect 단위)

## UI 구성 (선택 패널)

상단 카드 안에 한 줄씩 배치:

1. **Module** — Radio 또는 Tabs (T&C / Defect)
2. **Subcontractor** — 다중선택 (현재 모듈 raw data 기준 distinct 목록, 체크박스 팝오버)
3. **Sub-Sub** — 다중선택, 선택된 Sub의 자식만 표시. 없으면 비활성.
4. **System** — 다중선택 (system_master 기준; Defect엔 system 컬럼 없으면 비활성)
5. **기간** — 시작/종료 날짜 두 개 (shadcn Calendar Popover, `pointer-events-auto`)
6. **출력 데이터** — 체크박스 3개: `Planned`, `Actual`, (둘 다 체크 시 자동으로 `Variance = Actual − Planned` 컬럼 추가)
7. **S-Curve 시트 포함** — 체크박스 한 개. ON이면 별도 시트(A4 가로)로 누계 차트 출력.

하단 `Generate Excel` 버튼.

## 데이터 집계 규칙 (행=항목, 열=날짜)

- **행(세로)**: 한 행 = 개별 항목 (T&C는 Subtest 한 건 = Item No + MOS Code, Defect는 Issue No 한 건).
  좌측 식별 컬럼(고정/freeze):
  - Subcontractor, Sub-Sub, System, Item No(또는 Issue No), MOS Code(T&C), Description
  - 정렬: Subcontractor → Sub-Sub → System → Item No 오름차순. 같은 그룹 내 시각적 구분을 위해 그룹 첫 행에 옅은 상단 border.
  - 그룹 소계 행(Subcontractor 별, System 별)은 옵션 체크박스(`Include subtotals`)로 ON/OFF.
  - 맨 아래 총계(Grand Total) 행 항상 포함.

- **열(가로)**: 선택 기간 내 날짜별 1세트. 한 날짜당 최대 6개 컬럼:

```text
[Daily Planned] [Daily Actual] [Daily Var] [Cum Planned] [Cum Actual] [Cum Var]
```

- 각 항목 행의 셀 값:
  - Daily Planned = 해당 항목의 planned_date가 그 날짜와 같으면 1, 아니면 0
  - Daily Actual  = 해당 항목의 actual_date가 그 날짜와 같으면 1, 아니면 0
  - Cum Planned   = planned_date ≤ 해당 날짜이면 1
  - Cum Actual    = actual_date  ≤ 해당 날짜이면 1
  - Variance      = Actual − Planned (Planned·Actual 둘 다 체크된 경우에만 생성)
- 총계/소계 행은 단순 SUM.
- T&C는 보조 라디오로 `T1` / `T2` 중 하나 선택 (기본 T2). 둘 다 보고 싶으면 두 번 내보내기.

## 엑셀 구조

- 시트 1 — `Summary` : 선택 조건, 합계, 생성일시
- 시트 2 — `Daily & Cumulative` : 위 행/컬럼 매트릭스
- 시트 3 — `S-Curve` (옵션) : x=날짜, y=누계 건수. 라인 2개(Cum Planned, Cum Actual). 페이지 설정 A4 가로(landscape), 인쇄 영역 fit-to-page.

엑셀 최적화:
- 다단 헤더 (Row1: 날짜 — `mergeCells`로 6칸 병합, Row2: Planned/Actual/Var/Cum P/Cum A/Cum Var). 좌측 식별 컬럼은 2행 세로 병합.
- Freeze panes: 식별 컬럼 우측 + 헤더 2행 아래 고정.
- 헤더 굵게 + 배경색(`F1F5F9`), 식별 컬럼 좁게/숫자 컬럼 6~8 폭.
- 컬럼 폭 자동 계산(헤더와 데이터 max + 패딩 2). 좌측 식별 컬럼은 별도 폭.
- 날짜 헤더 셀은 `isoToExcelSerial`로 실제 date cell + `dd-mmm` 포맷.
- 숫자 0은 `-`로 표시 (`#,##0;(#,##0);-`).
- 그룹 소계/총계 행은 굵게 + 옅은 배경.

## 기술 구현

- 신규 파일:
  - `src/pages/admin/RecordExportTab.tsx` — UI + 데이터 fetch + 핸들러
  - `src/lib/record-export.ts` — 집계 함수 (`buildRecordMatrix`) + 엑셀 빌더 (`exportRecordWorkbook`)
- `AdminReportPage.tsx` Tabs에 `<TabsTrigger value="record">Record Export</TabsTrigger>` 및 `<TabsContent>` 추가.
- 데이터 fetch:
  - T&C: `subtests` (`subcontractor_name, subsub_name, system_id, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date`) + `system_master` join, `is_active = true`.
  - Defect: `defects` (`subcontractor_name, subsub_name, planned_completion_date, actual_completion_date` + system 컬럼 존재 시 포함).
  - `fetchAllRows` 사용해 1000행 제한 우회.
- S-Curve: `xlsx-js-style`의 차트 미지원 → `chart.js` 또는 `recharts` 캡처 대신 ExcelJS 도입 또는 PNG 차트 이미지를 시트에 삽입하는 방식 사용. 가벼운 방식으로 **ExcelJS**를 이 시트 한정 사용 (LineChart 네이티브 지원). 메인 시트는 기존 `xlsx-js-style` 유지.
- 파일명: `RecordExport_{module}_{start}_{end}.xlsx`.

## 권한

기존 Report 탭 접근권한 (`canAccessReport`)을 그대로 상속. 추가 가드 불필요.

## 작업 순서

1. 집계 유틸 (`record-export.ts`) + 단위 테스트(간단)
2. 엑셀 빌더 (헤더 병합, freeze, 날짜 셀)
3. S-Curve 시트 (ExcelJS 의존성 추가)
4. `RecordExportTab` UI + Subcontractor/Sub-Sub/System distinct 목록 fetch
5. AdminReportPage 탭 등록
6. 수동 검증: T&C/Defect 각각 작은 기간으로 다운로드해 헤더 정렬, 누계 일치, S-Curve 라인 확인
