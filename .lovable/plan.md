# §1 시스템 요약 표시 개선 (옵션 A · 시스템명만)

## 증상
`/ddn/input` Auto-fill 결과에서 Pred/T1/T2/R1S/R2S 시스템 요약이
- 시스템명 자리에 `(unknown)`
- 레벨이 압축되지 않고 `(L5, L6, Lv26, …, L32RF/LMR)` 전부 나열
- 너무 길어서 `… +1 more` 로 잘림

## 원인
1. `system_master.system_name_std` 가 대부분 NULL — 실제 이름은 `system_code` 컬럼. `auto-fill.ts` 가 빈 문자열만 받음.
2. `system-summary.ts` 의 `levelNum` 정규식 `/^L?(\d+)$/` 가 `Lv26`, `L32RF/LMR` 미인식 → 레벨 압축 자체가 무의미.

## 채택 방향: 시스템명만 노출

레터 본문에는 **레벨도, 카운트도 빼고 시스템명 리스트**만.

- 한 시스템에 여러 층이 걸려도 시스템 1건으로 취급
- 결과 예: `Chiller Plant, Sprinkler, Lighting`
- 중복 제거 + 알파벳 정렬
- `maxLen` 초과 시: 앞에서부터 채우고 `… +K systems` 로 마감

상세(레벨·Item No 첨부)는 **금번 범위 제외** — 별도 로직으로 추후 진행.

## 수정 범위 (프론트엔드 한정)

### A. `src/lib/ddn/auto-fill.ts`
- `system_master` SELECT 에 `system_code` 추가
- `sysName.set(id, system_name_std || system_code || '')` 폴백 적용 (planned + T&C reject 양쪽)
- 기존 `summarizeSystems(sysRows)` 호출 자리를 신규 `summarizeSystemNames(sysRows)` 호출로 교체
  - 적용 키: `planned_tests.{pred|t1|t2|r1s|r2s}_systems`, `sec3.tc_reject_system`
- `planned_tests.delayed_items` 의 시스템별 그룹 `name` 도 `summarizeSystemNames` 사용

### B. `src/lib/ddn/system-summary.ts`
- 신규 export `summarizeSystemNames(rows, {maxLen=120})`:
  - `rows.map(r => r.system).filter(Boolean)` → 중복 제거 → 정렬 → `", "` join
  - 길이 초과 시 앞부분만 유지 + `" … +K systems"`
- 기존 `summarizeSystems` 는 당분간 보존(다른 호출처 없으면 후속 PR 에서 제거)

### C. 테스트 `src/test/system-summary.test.ts`
- 빈 시스템·중복·정렬·길이 컷오프 케이스

## 비범위
- DB 마이그레이션 없음
- DDN 스키마 / 폼 / Docx 생성기 변경 없음
- 상세(레벨·Item No) 첨부 필드는 별도 작업
- 시스템명 정합화(`system_name_std` 채우기)는 별도 주제
