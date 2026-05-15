## 문제

`PunchRawDataPage.tsx`에는 Excel 내보내기 기능이 전혀 구현되어 있지 않습니다. (코드 검색 결과 `export*` 식별자 0개, `src/lib/`에 `punch-excel-export.ts` 파일 없음)

반면 Defect 측은 다음을 모두 갖추고 있습니다:
- `src/lib/defect-excel-export.ts`: `exportDefectRawToExcel`, `exportDefectRawToExcelBySubcontractor`, `exportDefectRawToZipBySubcontractor`
- `DefectRawDataPage.tsx`의 Export Excel 버튼 + Dialog (Single/Per-subcontractor, View-friendly/Re-import ready 옵션)

이전 작업에서 "Defect Raw Data UI/기능 모두 반영" 요청을 받았음에도 export 부분을 누락한 것을 확인했습니다. 죄송합니다.

## 작업 범위

### 1. 신규 파일: `src/lib/punch-excel-export.ts`
`defect-excel-export.ts` 구조를 그대로 이식하되 Punch 도메인에 맞게 변환:
- `exportPunchRawToExcel({ table, fieldConfig, globalFilter, searchParams, meta, format })`
- `exportPunchRawToExcelBySubcontractor(...)` — Punch는 subcontractor 개념이 약하므로 **Vendor**(또는 `responsible_party`) 기준으로 그룹핑
- `exportPunchRawToZipBySubcontractor(...)` — JSZip 사용, 동일 패턴
- 컬럼 정의는 `PUNCH_FIELDS` registry + `punch_field_config` 동적 필드를 사용 (현재 페이지의 visibleFields 로직과 동일)
- `format: 'view'`는 화면에 보이는 라벨/값, `'reimport'`는 Punch Import 양식 헤더와 raw 코드값

### 2. `src/pages/PunchRawDataPage.tsx` 수정
- import 추가
- state 추가: `exportDialogOpen`, `exportMode`, `exportFormat`, `exportBusy`
- 툴바에 **Export Excel** 버튼 + (선택) `/punches/export` 페이지로 가는 Export 버튼
- Defect와 동일한 Dialog 마크업 복사:
  - Format: View-friendly / Re-import ready
  - Mode: Single file / Per-vendor (ZIP for many)
- 핸들러는 위 신규 함수 호출

### 3. 그룹핑 키 결정 (확인 필요)
Defect는 `subcontractor` 컬럼으로 그룹핑합니다. Punch에서는 어느 필드를 사용할까요?

옵션:
- **A. Vendor** (가장 가까움 — Defect의 subcontractor 대응)
- **B. Discipline** (공종별 분배가 운영상 더 유용한 경우)
- **C. Responsible Party** (담당자 단위)

기본값으로 **A (Vendor)** 를 사용하고, 추후 옵션화 가능하도록 키를 상수로 분리해 둘 예정입니다. 다른 키를 원하시면 알려주세요.

## 영향 범위
- 신규 1개 파일, 수정 1개 파일
- DB/마이그레이션 없음
- 사이드바 변경 없음 (이미 Raw Data 위치는 Progress 다음)

## 검증
- 빌드 통과 확인
- View-friendly 단일 파일 다운로드 동작
- Re-import ready 포맷이 Punch Import 파서와 라운드트립 호환되는지 헤더 매칭 확인
