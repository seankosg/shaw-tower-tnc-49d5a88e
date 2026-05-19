# PPT 차트에 임베드된 .xlsx 추가 — 구현 계획

## 목표
PowerPoint 데스크탑에서 차트 우클릭 → "데이터 편집(Edit Data)" 클릭 시, 임베드된 Excel이 실제 차트 데이터와 함께 열리도록 구현합니다.

## 현재 상태 진단
- `pptxgenjs` v4.0.1는 차트 추가 시 기본적으로 `ppt/embeddings/Microsoft_Excel_Worksheet*.xlsx`를 생성하긴 합니다.
- 하지만 `src/lib/ppt-builder.ts`의 `postProcessXml`이 차트 XML(라인 두께/색상)을 사후 수정하면서 임베드된 xlsx의 캐시와 불일치가 발생합니다.
- Line chart의 다중 시리즈 + 날짜 카테고리 조합에서 셀 매핑이 비어 PowerPoint가 "데이터 편집" 시 빈 워크북을 띄웁니다.

## 해결 전략
PPT 생성 직후, ZIP을 풀어 차트별로 **(1) 올바른 xlsx를 재구성**하고 **(2) 차트 XML에 셀 참조(`<c:f>`, `<c:numRef>`, `<c:strRef>`)를 주입**하는 후처리 단계를 추가합니다.

## 작업 단계

### 1. 신규 모듈 `src/lib/ppt-embed-workbook.ts`
- `exceljs`를 동적 import (번들 사이즈 영향 최소화)
- 입력: 차트 XML(`<c:ser>` 파싱) → 시리즈명, 카테고리, 값
- 출력:
  - `Sheet1`에 헤더 1행 + 데이터 N행을 가진 완전한 xlsx 버퍼
  - 각 시리즈별 셀 범위(`Sheet1!$B$2:$B$N` 등) 메타데이터

### 2. 차트 XML 보강 로직
- 각 `<c:ser>` 안의 `<c:tx>`, `<c:cat>`, `<c:val>`에 누락된 `<c:f>` 참조를 주입
- 기존 `<c:numCache>` / `<c:strCache>`는 유지 (값 표시용)
- Line/Bar/Stacked/Pie/Doughnut 5종 차트 타입 모두 처리

### 3. `src/lib/ppt-builder.ts` 통합
- `pptxgenjs`가 생성한 Blob을 `JSZip`으로 열기
- `ppt/charts/chart*.xml` 순회:
  - 기존 line style/color 후처리 유지
  - 신규: 시리즈 추출 → xlsx 재생성 → 차트 XML에 참조 주입
  - 대응하는 `ppt/embeddings/*.xlsx` 교체
  - `ppt/charts/_rels/chart*.xml.rels`의 임베드 관계 확인/보정
- `[Content_Types].xml`에 xlsx Default extension 확인

### 4. 검증
- 테스트용 PPT 생성 후 ZIP 내부 구조 점검 스크립트(`scripts/inspect-ppt-embeddings.ts`)
- 점검 항목:
  - 각 차트마다 임베드된 xlsx 존재
  - xlsx 내 Sheet1 데이터가 차트 캐시와 일치
  - 차트 XML의 `<c:f>` 참조가 실제 xlsx 셀과 매칭
- 데스크탑 PowerPoint에서 수동 확인:
  - Plan vs Actual (Line), Forecast (Line), Defect S-Curve, Punch 분포 등 주요 차트
  - "데이터 편집" 클릭 → Excel 정상 오픈 → 값 수정 → 차트 갱신 확인

## 영향받는 파일
- 신규: `src/lib/ppt-embed-workbook.ts`
- 신규(개발용): `scripts/inspect-ppt-embeddings.ts`
- 수정: `src/lib/ppt-builder.ts` (후처리 파이프라인 확장)
- 신규 의존성: `exceljs` (동적 import)

## 알려진 트레이드오프
- PPT 파일 크기: 차트당 4~15KB 증가 (10차트 기준 ~100KB)
- 빌드 시간: 차트당 200~600ms 증가
- 번들: `exceljs`(~600KB) 동적 로드 (Report 페이지 진입 시에만)
- LibreOffice/Keynote에서는 "데이터 편집" 미지원 (PowerPoint 전용) — 데스크탑 PPT 사용자 타겟이므로 수용
- 후처리 순서: line style 패치 → xlsx 재생성 → 참조 주입 순서로 고정

## 사용자 확인 사항
이 계획은 ReportTab > PPT Export로 다운로드되는 모든 차트에 일괄 적용됩니다. 특정 차트만 적용하거나 제외할 필요가 있으면 알려주세요.
