# §1 시스템 요약 표시 개선 (옵션 A · 시스템명 기준)

## 증상
`/ddn/input` Auto-fill 결과에서 Pred/T1/T2/R1S/R2S 시스템 요약이
- 시스템명 자리에 `(unknown)`
- 레벨이 압축되지 않고 `(L5, L6, Lv26, …, L32RF/LMR)` 전부 나열
- 너무 길어서 `… +1 more` 로 잘림

## 원인
1. `system_master.system_name_std` 가 대부분 NULL — 실제 이름은 `system_code` 컬럼에 있음. `auto-fill.ts` 가 빈 문자열만 받음.
2. `system-summary.ts` 의 `levelNum` 정규식 `/^L?(\d+)$/` 가 `Lv26`, `L32RF/LMR` 미인식.

## 채택 방향: 옵션 A — 시스템명 기준 카운트, 상세는 별도 첨부

레터 본문에는 **레벨을 빼고 시스템명만** 노출, 상세(레벨·Item No)는 별도 첨부 필드로 분리.

### 1. 요약 표기(레터 본문용)
- 한 시스템에 여러 층이 걸려도 시스템 1건으로 카운트
- 결과 예: `Chiller Plant ×3, Sprinkler ×2, Lighting ×1` (총 6 subtest, 3 system)
- `maxLen` 초과 시: 상위 N개만 노출 후 `… +K systems`
- 새 필드 키:
  - 기존 `planned_tests.{stage}_systems` ← "Chiller Plant, Sprinkler, Lighting" (시스템명만, 중복 제거, 알파벳 정렬)
  - 신규 `planned_tests.{stage}_system_count` ← 고유 시스템 수
  - 신규 `planned_tests.{stage}_detail` ← 상세 블록(아래 2번)

### 2. 상세 첨부 표기
- 시스템별로 한 줄, 레벨과 Item No 를 묶어 나열
- 결과 예:
  ```
  Chiller Plant: L5, L6, L7 (ACMV-007, ACMV-010, ACMV-019)
  Sprinkler:     L21–L31 (FP-015, FP-023)
  Lighting:      L1 (Elec-010)
  ```
- 레벨은 기존 압축 로직 재사용(수정 후), Item No 는 그대로 콤마 나열
- 어디에 붙일지: DDN 입력 폼에 신규 readonly textarea 필드 `planned_tests.{stage}_detail` 추가 → Docx 생성기에서 부록 섹션으로 출력

## 수정 범위 (프론트엔드 한정)

### A. `src/lib/ddn/auto-fill.ts`
- `system_master` SELECT 에 `system_code` 추가, `system_name_std || system_code || ''` 폴백
- §3 T&C Reject 매핑에도 동일 폴백
- `fetchPlannedTests` 의 stage별 planned 배열에서 `{ system, level, item_no }` 수집
- 새 헬퍼 `summarizeSystemsByName()` / `buildDetailBlock()` 호출하여 3개 필드(`_systems`, `_system_count`, `_detail`) 매핑

### B. `src/lib/ddn/system-summary.ts`
- `levelNum` 정규식 → `/^L[vV]?(\d+)$/i`, 출력은 `L{n}` 통일
- 숫자/비숫자 혼합 시: 숫자형은 범위 압축, 비숫자(`L32RF/LMR`)는 정렬 후 뒤에 부착
  - 예: `[L21..L31, L32RF/LMR]` → `L21–L31, L32RF/LMR`
- 신규 export:
  - `summarizeSystemsByName(rows, {maxLen})` — 시스템명만 카운트한 요약 문자열
  - `buildDetailBlock(rows)` — 시스템별 레벨·Item No 다줄 텍스트

### C. DDN 스키마 / 폼
- `ddn_fields` 시드에 stage별 `*_system_count` (number, readonly), `*_detail` (textarea, readonly) 추가
- `DynamicForm.tsx` 가 readonly textarea 를 적절히 렌더링하는지 확인(이미 지원)
- Docx 생성기(`docx-generator.ts`)에 `_detail` 을 §1 하단 "Details" 블록으로 출력하는 섹션 추가

### D. 테스트 `src/test/system-summary.test.ts`
- `Lv` 접두사 혼합 / 비숫자 레벨 혼합 압축
- `summarizeSystemsByName` 카운트·정렬·길이 컷오프
- `buildDetailBlock` 다줄 출력 형식

## 비범위
- DB 마이그레이션은 `ddn_fields` 시드 추가만 (스키마 변경 없음)
- Auto-fill 적용 로직/배너 UI 변경 없음
- 시스템명 정합화(`system_name_std` 채우기)는 별도 주제
