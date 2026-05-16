# T&C 데이터 정합 수정 — Option B + 재발 방지

## 결정 사항 (확정)
- **Option B 채택**: `is_active = false`는 "사실상 삭제"이므로 모든 통계 모집단에서 제외. 대시보드/시뮬레이션이 잘못된 1903을 보여주는 것이 버그이며, 리포트(1786)가 정답.
- **R2S 시퀀셜**: `r1 Done` 선행(시뮬레이션 코드와 일치). T2 done은 R2S done의 선행 조건 아님.
- **메타 버저닝**: `reportVersion: 2` 추가하여 외부 LLM이 스키마 분기 가능.

## 변경 범위

### 1) 대시보드/시뮬레이션 — `is_active` 필터 일괄 적용 (Option B 본진)

`subtests` 테이블에서 행을 가져오는 모든 클라이언트 경로에 `.eq('is_active', true)` 적용. 현재 누락된 곳을 전수 점검하여 수정.

수정 대상(현재 누락 의심 — 구현 전 `rg "from\('subtests'\)"`로 최종 확인):
- `src/pages/TncSimulationPage.tsx` — `loadData()`의 `supabase.from('subtests').select('*')`
- `src/lib/subtest-cache.ts` — 대시보드 카드/매트릭스 공용 캐시 경로
- `src/lib/dashboard-utils.ts` 호출부에서 모집단을 직접 fetch 하는 곳
- `src/lib/schedule-cache.ts` / 스케줄 매트릭스 fetch 경로
- 기타 `from('subtests')` 사용 위치 전수 점검

예상 사이드이펙트: 사용자가 본 1903 수치(시뮬레이션 카드 `Total Subtests`, T1/T2/R1S/R2S 분모)가 1786으로 보정됨. 동일 비율로 done %는 소폭 상승(분모 ↓). 사용자가 본 화면도 변경된다는 점 명시.

### 2) 리포트 — 카운팅 로직을 단일 진실 소스로 통일

`src/lib/report-builder.ts` (`computeTncData`):
- `import { isStageDone, getStagePlannedDate } from '@/lib/stage-metrics';`
- Done 카운트:
  - `t1Done  = rows.filter(r => isStageDone(r,'t1')).length`
  - `t2Done  = rows.filter(r => isStageDone(r,'t2') && isStageDone(r,'t1')).length` (시퀀셜)
  - `r2sDone = rows.filter(r => isStageDone(r,'r2s') && isStageDone(r,'r1')).length` (시퀀셜)
- `currentActual.{preTestPct, officialTestPct, testReportPct}`는 위 done / total*100.
- `plannedToDate` 및 `*VariancePct`의 기준일을 `today` → `dataDate`로 변경 (`getStagePlannedDate(r, stage) <= dataDate` 카운트). 대시보드의 "vs PLAN @ data date" 카드와 의미 일치.
- `requiredPace`도 새 done 카운트로 재계산.
- 스냅샷(`simulateAllTncStages`) 분모 자동 정합 → 14-Jun T2 predicted ≈ 94.5% 수렴 예상.
- `fetchTnc()`의 `.eq('is_active', true)`는 그대로 유지(Option B와 일치).

### 3) 메타 버저닝 — 외부 LLM 혼동 차단

`ReportMeta`에 추가:
- `reportVersion: 2`
- `changeNotes: string[]` — 예: `["v2: is_active=false rows excluded from all populations; counts use isStageDone with sequential guards (T1→T2, R1→R2S); variance computed at dataDate."]`
- `populationFilter: 'is_active = true'` (모집단 정의를 메타에 명시 → LLM이 N=1786의 근거를 알게 됨)

## 4) 재발 방지

### 4-A) 공용 헬퍼 강제화 (런타임)
`src/lib/subtest-cache.ts`(또는 신설 `src/lib/subtest-population.ts`)에 단일 진입점 추가:
```ts
// 모든 통계 모집단은 반드시 이 함수를 통해 가져온다
export async function fetchActiveSubtests(/* filters */) {
  return supabase.from('subtests').select('*').eq('is_active', true);
}
```
- 대시보드/시뮬레이션/리포트 모두 이 함수를 호출하도록 리팩토링.
- 단일 함수에서 필터를 강제하므로 누락 불가.

### 4-B) ESLint 가드 (정적)
`eslint.config.js`에 `no-restricted-syntax` 규칙 추가:
- "`from('subtests')` 직접 호출 금지 — `fetchActiveSubtests` 사용" 메시지.
- 예외 허용: `src/lib/subtest-population.ts`와 import/raw-data 페이지(원본 행 노출 의도)는 화이트리스트.
- 신규 코드가 PR 단계에서 즉시 잡힘.

### 4-C) DB 레벨 뷰 (선택, 권장)
마이그레이션으로 `public.subtests_active` 뷰 생성:
```sql
create view public.subtests_active as
  select * from public.subtests where is_active = true;
```
- RLS는 베이스 테이블 정책을 상속.
- 향후 신규 통계 코드는 뷰를 사용하면 `is_active` 누락이 구조적으로 불가능.
- 기존 코드(`from('subtests')`)는 그대로 동작하므로 점진적 마이그레이션 가능.
- 이번 PR에서는 뷰 생성만, 호출부 전환은 별건으로 분리.

### 4-D) 회귀 테스트
`src/test/subtest-population.test.ts` 신설:
- 시뮬레이션 카운터·리포트 카운터에 비활성 행 혼입 시 분모가 1786 유지되는지 검증(픽스처 기반).
- T1→T2, R1→R2S 시퀀셜 가드 회귀 케이스.
- 향후 누군가 필터를 빼면 테스트가 즉시 실패.

### 4-E) 코드 리뷰 체크리스트 (`.github` 또는 README)
- "subtests 모집단을 새로 fetch 했나? → `fetchActiveSubtests` 사용했나?"
- "is_active 필터가 없는 PR은 머지 금지."

## 검증 체크리스트 (구현 후)

리포트 탭에서 JSON 재생성:
1. `tnc.totals.total === 1786` (Option B 기준)
2. `tnc.totals.t1 / t2 / r2s` 가 대시보드 "DONE NOW" 카드와 정확히 일치 (대시보드도 1786 모집단으로 보정된 신규 값)
3. `currentActual.officialTestPct ≈ t2Done/1786*100`, `officialTestVariancePct = actual − plan@dataDate`
4. `tnc.snapshots[date=2026-06-14].t2.predictedPct ≈ 94.5`
5. `meta.reportVersion === 2`, `meta.populationFilter === 'is_active = true'`
6. `bunx vitest run src/test/tnc-simulation.test.ts src/test/subtest-population.test.ts` 통과

## 비-범위(별건)
- R1S 스테이지 JSON 노출 (T1→T2→**R1S**→R2S 4단 표시)
- DB 뷰 호출부 일괄 전환 (4-C 후속)
- 과거 v1 산출물 마이그레이션 — 외부 보관물이므로 손대지 않음

## 사용자 확인 후 진행
이 계획대로 진행해도 될지 승인 부탁드립니다. 승인 시:
- (1)(2)(3)(4-A)(4-B)(4-D) 즉시 구현 + JSON 재생성하여 4개 검증값 공유
- (4-C) DB 뷰 마이그레이션은 별도 마이그레이션 승인 절차로 동시 진행
