# §1 시스템 요약 표시 개선 (옵션 A · 시스템명만)

## 증상
`/ddn/input` Auto-fill 결과에서 Pred/T1/T2/R1S/R2S 시스템 요약이
- 시스템명 자리에 `(unknown)`
- 레벨이 압축되지 않고 `(L5, L6, Lv26, …, L32RF/LMR)` 전부 나열
- 너무 길어서 `… +1 more` 로 잘림

## 원인
1. `system_master.system_name_std` 가 대부분 NULL — 실제 이름은 `system_code` 컬럼.
2. `system-summary.ts` 의 `levelNum` 정규식 `/^L?(\d+)$/` 가 `Lv26`, `L32RF/LMR` 미인식.

## 채택 방향: 시스템명만 노출

레터 본문에는 **레벨·카운트 모두 빼고 시스템명 리스트**만.
- 중복 제거 + 알파벳 정렬 + `", "` join
- 예: `Chiller Plant, Sprinkler, Lighting`
- `maxLen` 초과 시 앞에서부터 채우고 `… +K systems`

상세(레벨·Item No 첨부)는 **금번 범위 제외** — 별도 로직으로 추후 진행.

## 사전점검: 계획값/실적값/차이값 계산 영향 없음 확인

이번 변경은 **표시 문자열만 교체**하며, 카운트/퍼센트 계산 경로는 손대지 않음.

| 필드 | 산출식 | 데이터 소스 | 이번 변경 영향 |
|---|---|---|---|
| `planned_tests.{stage}_plan` | `rows.filter(planned_date === D).length` | subtests | 무영향 (row 카운트) |
| `planned_tests.{stage}_actual` | `rows.filter(actual_date === D && status∈Done/Submitted/Approved).length` | subtests | 무영향 |
| `planned_tests.{stage}_pct` | `Math.round(actual / plan * 100)` (computed.ts) | inputs | 무영향 (숫자만 참조) |
| `planned_tests.{stage}_systems` | 시스템 리스트 문자열 | subtests | **변경 대상** — 표시만 |
| `planned_tests.delayed_items` | `planned_date < D && status !== 'Done'` 카운트·그룹 | subtests | 무영향 (그룹 `name` 표시만 교체) |
| `sec3.tc_reject*` | `subtest_change_log` 개수/유무 | log | 무영향 (시스템 표기만 교체) |

체크 결론:
1. `summarizeSystemNames` 는 `_systems`, `tc_reject_system`, `delayed_items[].name` 의 **string 값**만 다시 만들고, `_plan`/`_actual`/`_pct`/`delayed_items[].reasons` 등 숫자/플래그 필드는 그대로.
2. `subtests` 조회 필터(`is_active=true`, `subcontractor_name IN PT`)와 stage별 date 필터는 동일 유지 — 동일 row 가 plan/actual/system 모두에 사용됨. 즉 "시스템 통합" 으로 카운트가 어긋날 여지 없음.
3. 차이값(plan − actual)을 사용하는 별도 computed 키는 없으며, `*_pct` 만 존재.
4. 시스템 통합은 **표시 단계에서 dedupe** 만 수행하므로, 같은 시스템에 N개 subtest가 있어도 plan 카운트는 N으로 정상 유지(시스템 통합과 무관).

## 수정 범위 (프론트엔드 한정)

### A. `src/lib/ddn/auto-fill.ts`
- `system_master` SELECT 에 `system_code` 추가
- `sysName.set(id, system_name_std || system_code || '')` 폴백 (planned + tc_reject 양쪽)
- `summarizeSystems(...)` 호출을 `summarizeSystemNames(...)` 로 교체
  - 대상: `planned_tests.{pred|t1|t2|r1s|r2s}_systems`, `sec3.tc_reject_system`, `delayed_items[].name`
- 카운트/필터/상태 판정 로직은 **무수정**

### B. `src/lib/ddn/system-summary.ts`
- 신규 export `summarizeSystemNames(rows, {maxLen=120})`:
  - 시스템명만 추출 → trim → 빈값 제거 → 중복 제거 → 정렬 → `", "` join
  - 길이 초과 시 앞부분 유지 + `" … +K systems"`
- 기존 `summarizeSystems` 는 보존(호출처 제거 후에도 후속 PR 에서 정리)

### C. 테스트 `src/test/system-summary.test.ts`
- 빈/중복/정렬/길이 컷오프
- (참고) plan/actual 카운트는 별도 테스트 불필요 — 본 변경이 해당 경로를 건드리지 않음

## 비범위
- DB 마이그레이션 없음
- DDN 스키마 / 폼 / Docx 생성기 변경 없음
- 상세(레벨·Item No) 첨부 필드는 별도 작업
- `system_name_std` 정합화는 별도 주제
