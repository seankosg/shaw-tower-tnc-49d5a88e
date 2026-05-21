# §1 시스템/Subtest 요약 표시 개선

## 증상
`/ddn/input` Auto-fill 결과에서 Pred/T1/T2/R1S/R2S 시스템 요약이
- 시스템명 자리에 `(unknown)`
- 레벨이 `(L5, L6, Lv26, Lv27, …, L32RF/LMR)` 모두 나열, 압축 실패
- 너무 길어서 `… +1 more`로 잘림

## 근본 원인
1. `system_master.system_name_std` 가 대부분 NULL — 실제 이름은 `system_code` 컬럼에 있음. `auto-fill.ts` 가 빈 문자열만 받음.
2. `system-summary.ts` 의 `levelNum` 정규식 `/^L?(\d+)$/` 가 `Lv26`, `L32RF/LMR` 미인식 → 한 건만 비숫자여도 압축 포기.

## 표시 방식 선택

레터 본문용이라 짧게 가야 하므로 두 옵션 중 선택:

### 옵션 A. 시스템·레벨 요약(현재 방식) 수정
- 결과 예: `Chiller Plant (L5–L7); Sprinkler (L21–L31, L32RF/LMR); Lighting (L1)`
- 장점: "어느 시스템·어느 층"이 직관적, 레터 톤에 적합
- 단점: 시스템 수가 많으면 길어짐(현재 `maxLen=120` 이미 자르고 있음)

### 옵션 B. Subtest ID 축약(신규 제안)
- `item_no` prefix(ACMV/Elec/FP/PSG…) 별로 그룹핑하고 일련번호를 범위 압축
- 결과 예: `ACMV-007,008,010,019,029–030,034; Elec-010,135; FP-015; PSG-033`
- 더 짧게: prefix별 카운트만 → `ACMV ×8, Elec ×2, FP ×1, PSG ×1`
- 장점: 매우 컴팩트, 추적성 높음(레터 받는 쪽이 Item No 로 역참조 가능)
- 단점: 비기술 독자에겐 "어느 시스템"인지 한눈에 안 보임

### 권장: A + B 병행
- 기본은 옵션 A(레터에는 시스템명이 자연스러움)
- 80자 초과로 잘릴 때만 옵션 B(prefix×count) 로 자동 폴백
- 결과 예(짧을 때): `Chiller Plant (L5–L7); Sprinkler (L21–L31)`
- 결과 예(길 때): `ACMV ×8, Elec ×2, FP ×1, PSG ×1` (총 12건)

## 수정 범위 (프론트엔드 한정)

### A. `src/lib/ddn/auto-fill.ts`
- `system_master` SELECT 에 `system_code` 추가
- `sysName.set(id, system_name_std || system_code || '')` 폴백
- §3 T&C Reject 동일 매핑에도 같은 폴백 적용
- `fetchPlannedTests` 에서 stage별 `planned` 배열의 `item_no` 도 함께 수집해 `summarizeSubtests()` 입력으로 전달

### B. `src/lib/ddn/system-summary.ts`
- `levelNum` 정규식 → `/^L[vV]?(\d+)$/i`
- 출력은 `L{n}` 로 통일(`Lv26` → `L26`)
- 숫자/비숫자 혼합 시: 숫자형은 범위 압축, 비숫자(`L32RF/LMR`)는 정렬해 뒤에 부착
  - 예: `[L21..L31, L32RF/LMR]` → `(L21–L31, L32RF/LMR)`
- `summarizeWithFallback(systemRows, subtestRows, maxLen)` 신규 export
  - 1차: 기존 시스템·레벨 요약 시도
  - 길이 초과 시 2차: `summarizeSubtests` (prefix×count) 로 폴백

### C. `summarizeSubtests` 신규 헬퍼
- 입력: `item_no[]`
- `prefix-숫자` 분해 → prefix별 카운트 → `ACMV ×8, Elec ×2 …` 반환
- 길이 여유 있으면 일련번호 범위까지 펼침(옵션)

### D. 테스트 `src/test/system-summary.test.ts`
- 순수 숫자 압축
- `Lv` 접두사 혼합
- 비숫자 레벨 혼합(`L32RF/LMR`)
- 시스템명 폴백
- subtest prefix 카운트 폴백

## 비범위
- DB 마이그레이션 없음 (시스템명 정합화는 별도 주제)
- Auto-fill 적용 로직/배너/UI 변경 없음
- 다른 섹션(§3 T&C reject 시스템 표시)은 동일 헬퍼 자동 적용
