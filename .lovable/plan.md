## 목표
Report 탭에서 마크다운을 내보낼 때, 위에서 작성한 **T&C Raw Data Business Guide** 를 리포트 본문에 함께 포함시킵니다.

## 변경 파일

### 1) `src/lib/report-builder.ts`
- 상수 `TNC_RAW_DATA_GUIDE_MD` 추가 — 사용자가 제공한 가이드 전문(영문 마크다운)을 그대로 보관.
- `ReportOptions`에 `includeTncGuide?: boolean` 추가 (기본 `true`).
- `buildReportMarkdown()`에서 `tnc` 모듈이 포함되어 있고 `includeTncGuide !== false` 이면, T&C 섹션 바로 앞(또는 헤더 직후)에 가이드를 별도 섹션으로 삽입:
  ```
  ## Appendix A — T&C Raw Data Business Guide
  ...가이드 본문...
  ```
- 헤더 라인 한 줄(`_T&C guide: included_`)도 추가해 포함 여부를 명시.

### 2) `src/pages/admin/ReportTab.tsx`
- "Include T&C Business Guide" 체크박스 추가(기본 ON, T&C 모듈 선택 시에만 활성화).
- 상태값을 `buildReportMarkdown` 호출 시 `includeTncGuide`로 전달.

## 비포함 사항
- Defect/Docs/Punch에는 별도 가이드 추가 없음(요청 범위가 T&C Raw Data Guide).
- 가이드 본문은 코드 상수로 보관(번역/편집은 추후 별도 요청 시 처리).

## 검증
- 리포트 생성 후 미리보기에 "Appendix A — T&C Raw Data Business Guide" 섹션과 모든 항목(컬럼 표, 대시보드 카드 설명 등)이 누락 없이 렌더링되는지 확인.
- 체크박스 OFF 시 가이드가 빠지는지 확인.
