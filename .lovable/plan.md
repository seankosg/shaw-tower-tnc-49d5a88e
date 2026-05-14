## 목표

T&C 모듈의 모든 UI/Export에서 핵심 지표를 **R2A(승인일) → R2S(제출일)**로 전환합니다.
- DB 컬럼(`r2_target_approval_date`, `r2_actual_approval_date`)은 **유지**합니다.
- Import는 R2A 데이터를 계속 받아 저장합니다(미래 복원 가능).
- 사용자에게 노출되는 모든 카드/컬럼/필터/Excel에서는 R2A를 **숨기고** R2S만 노출합니다.

---

## 전제 (코드 분석 결과)

`src/lib/stage-metrics.ts`에는 이미 `r2s`와 `r2a` 두 stage가 모두 정의되어 있고, 헬퍼 함수(`getStagePlannedDate`, `isStageDone` 등)가 양쪽을 모두 지원합니다. 따라서 **stage 정의 로직은 그대로 두고**, 노출되는 stage 리스트만 교체하면 됩니다.

---

## 변경 사항

### 1. 핵심 stage 리스트 (단일 진실 소스)

**`src/lib/stage-metrics.ts`**
- `ALL_STAGE_KEYS`: `['pred','t1','t2','r1','r2s','r2a']` → `['pred','t1','t2','r1','r2s']`
- `r2a` 관련 헬퍼 분기는 그대로 유지(향후 복원 대비).

**`src/lib/tnc-simulation.ts`**
- `TncSimStage` 타입: `'r2a'` → `'r2s'`
- `ALL_TNC_SIM_STAGES`: `['t1','t2','r1','r2a']` → `['t1','t2','r1','r2s']`
- `TNC_SIM_STAGE_LABELS`: `r2a: 'R2A'` 제거, `r2s: 'R2S'` 추가
- `prerequisiteStages('r2s') → ['r1']` (기존 r2a 룰을 r2s에 적용)
- 주석/JSDoc의 R2A 표기를 R2S로 교체

### 2. T&C Simulation 페이지

**`src/pages/TncSimulationPage.tsx`**
- import/타입 참조 r2a → r2s로 정리
- URL 파라미터 마이그레이션: `?stages=` 값에 `r2a`가 있으면 `r2s`로 자동 치환(레거시 북마크 호환)

### 3. T&C Dashboard

**`src/lib/dashboard-utils.ts`**
- `ALL_STAGES`: `r2a` 제거
- `OCCURRENCE_STAGES`: `r2a` → `r2s`
- KPI 계산 `calc('r2a')` → `calc('r2s')`
- 주석 "R2S/R2A" → "R2S"

**`src/pages/DashboardPage.tsx`**
- `stageStat('r2a', 'r2_target_approval_date')` → `stageStat('r2s', 'r2_target_submission_date')`
- KPI 카드 `<StageCard stage="R2A" …>` → `<StageCard stage="R2S" …>` 라벨 및 navigate 파라미터(`r2_delay_asof` → `r2s_delay_asof`) 정리
- 팀 매트릭스 행 라벨 `'R2A'` → `'R2S'`

### 4. T&C Progress (Schedule)

**`src/lib/schedule-utils.ts`**
- 노출 stage 배열에서 `r2a` 제거: `['pred','t1','t2','r1','r2s','r2a']` → `['pred','t1','t2','r1','r2s']`
- `RISK_STAGES`에서 `r2a` 제거
- 라벨 맵에서 `r2a: 'R2A'` 제거

**`src/pages/SchedulePage.tsx`**
- Stage 토글 그룹의 R2A 토글 버튼 제거
- stage 처리 분기에서 `r2a` 케이스 제거
- 레거시 URL 파라미터 마이그레이션(r2a → r2s)

**`src/components/schedule/ScheduleMatrix.tsx`**
- `ALL_STAGES`에서 `r2a` 제거
- 셀 색상 분기 `st === 'r2a'` 제거(또는 `r2s`로 색상 이전)

**`src/components/schedule/CriticalWatchlist.tsx`**
- `item.stage === 'r2a'` 분기 제거(또는 `r2s`로 이전)

### 5. Raw Data (SubtestList) 필터

**`src/pages/SubtestList.tsx`**
- `STAGE_FILTER_KEYS`: `['pred','t1','t2','r1','r2a']` → `['pred','t1','t2','r1','r2s']`
- 라벨 맵에서 `r2a: 'R2A'` 제거, `r2s: 'R2S'` 추가
- "Remaining" 필터의 완료 판단을 `isStageDone(r,'r2a')` → `isStageDone(r,'r2s')`로 전환
- 행 정렬 가중치(`isStageDone(r,'r2a') ? 16 : 0`)를 `r2s` 기준으로 변경
- URL 파라미터 호환: 시뮬레이션/대시보드에서 넘어오는 기존 `r2_*` 파라미터를 `r2s_*`로 매핑하거나, 동일 키를 R2S용으로 재해석

### 6. Subtest Detail / 공유 컴포넌트

**`src/components/shared/StageProgress.tsx`**
- "Pred → T1 → T2 → R1 → R2A" → "Pred → T1 → T2 → R1 → R2S"
- R2A Pip/툴팁 제거, R2S Pip 추가(분류 함수는 r2s로 호출)
- 색상/상태 분기 r2a → r2s로 교체

**`src/pages/SubtestDetail.tsx`**
- R2A 표기 제거 또는 R2S로 교체(상세 점검 후)

### 7. Excel Export

**`src/lib/excel-export.ts`**, **`src/lib/schedule-excel-export.ts`**
- 출력 컬럼 목록의 `r2a` 제거 (R2A Target/Actual Approval Date 컬럼 미출력)
- R2S Target/Actual Submission Date는 유지/추가

### 8. 기타 보조 파일

**`src/lib/filter-chip-utils.ts`**
- `STAGE_KEYS`에서 `r2a` 제거, `r2s` 추가
- 라벨 맵 `r2a: 'R2A'` 제거, `r2s: 'R2S'` 추가

**`src/lib/business-days.ts`, `src/lib/bulk-actions.ts`, `src/lib/subtest-cache.ts`**
- R2A 전용 처리 로직이 있다면 R2S로 이전(필요시 r2a는 silent fallback으로 보존)

### 9. 비변경 영역 (그대로 유지)

- DB 스키마: `r2_target_approval_date`, `r2_actual_approval_date` 컬럼 유지
- `src/contexts/ImportContext.tsx`: R2 Approval 컬럼 import/insert 로직 유지
- `src/lib/import-parser.ts`, `src/pages/admin/HeaderMappingsTab.tsx`: R2 Approval 헤더 매핑 유지(엑셀 import 호환)
- `src/lib/stage-metrics.ts`의 `r2a` 분기 헬퍼: 유지 (URL 파라미터/개별 호출 시 안전)

### 10. 테스트

**`src/test/tnc-simulation.test.ts`**
- R2A 테스트 케이스를 R2S 기준으로 변경 (`r2_target_submission_date` 사용)

---

## 사용자 영향 요약

| 화면 | 변경 전 (R2A) | 변경 후 (R2S) |
|------|--------------|---------------|
| T&C Dashboard 카드 | T1·T2·R1·**R2A** | T1·T2·R1·**R2S** |
| T&C Simulation 카드/차트 | 4단계 (R2A 포함) | 4단계 (R2S 포함) |
| T&C Progress 토글/매트릭스 | Pred·T1·T2·R1·R2S·**R2A** | Pred·T1·T2·R1·**R2S** |
| Raw Data 필터/Stage Pip | R2A 포함 | R2A 제거, R2S만 |
| Excel Export | R2A 컬럼 포함 | R2A 컬럼 미출력 |
| Subtest Detail Stage Bar | …→R2A | …→R2S |

---

## 위험 및 완화

- **레거시 URL 북마크**: `?stages=r2a` 등을 사용하던 사용자는 차트가 비어 보일 수 있음 → 페이지 진입 시 r2a → r2s 자동 치환.
- **기존 R2A 기준 의사결정 데이터**: DB에 그대로 보존되므로, 향후 필요 시 분기 한 줄로 즉시 복원 가능.
- **Import 깨짐 없음**: import는 R2 Approval 컬럼을 계속 수신·저장.

---

## 작업 순서

1. `stage-metrics.ts`, `tnc-simulation.ts` (단일 진실 소스 교체)
2. Dashboard / Simulation / Progress 페이지
3. Raw Data 및 Stage Pip 컴포넌트
4. Excel Export
5. 보조 유틸 (filter-chip-utils 등)
6. 테스트 갱신 및 빌드 확인
