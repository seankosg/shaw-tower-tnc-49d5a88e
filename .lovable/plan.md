
## T&C Simulation Tab — Implementation Plan

기존 Defect Simulation과 **완전히 동일한 로직·UI**를 T&C(Subtest) 데이터에 맞게 포팅합니다.

### Stages
- `t1` (T1) · `t2` (T2) · `r1` (R1S) · `r2a` (R2A)
- 라벨은 기존 `STAGE_LABELS`(schedule-utils.ts) 그대로 사용 (T1 / T2 / R1S / R2A)
- 날짜·완료 판정은 기존 `stage-metrics.ts`의 `getStagePlannedDate` / `getStageActualDate` / `isStageDone` 재사용

### 새 파일

#### 1. `src/lib/tnc-simulation.ts` (신규, ~330 줄)
`defect-simulation.ts`의 1:1 미러. 차이점만:
- 입력 타입 `SubtestForDashboard` (from `dashboard-utils`)
- `TncStage = 't1' | 't2' | 'r1' | 'r2a'` + `ALL_TNC_STAGES`
- `getEffectiveActualDate(s, stage)` — 캐스케이드 없이 단순히 `getStageActualDate` 사용 (T&C는 단계 간 fallback이 의미 없음)
- `effectiveForecastDate` / `DelayMode` / `DELAY_MODE_LABELS` — 동일
- `computeStageLagDays` — 4개 stage에 대해 동일한 평균 lag 계산 (sample ≥ 5)
- `simulateTncStageAt`, `simulateAllTncStages`, `buildTncSimulationSeries`, `simulateByTeam` — 동일 시그니처
- `SeriesPoint`는 4 stage × {plan, actual, predicted} = 12 필드

#### 2. `src/pages/TncSimulationPage.tsx` (신규)
`DefectSimulationPage.tsx` 1:1 복제 후 변경점:
- 데이터 로드: `subtests` 테이블 (페이지네이션 동일 패턴), 필요한 컬럼 select
- `useLatestSubtestDataDate()` 훅 사용
- Stage 토글: T1/T2/R1S/R2A 4개
- 차트 라인: stage 4 × {plan, actual/predicted} = 동적 렌더 (기존 코드의 stage map 일반화)
- Stage 카드: 4개 카드 (그리드 `lg:grid-cols-4`)
- 팀 브레이크다운 테이블: 4개 stage 컬럼 그룹
- 행 클릭 → `/tc/raw-data?...` 로 네비게이션 (delayed/remaining 필터 파라미터 동일하게 매핑; team 파라미터만 사용)
- URL 파라미터: `team`, `stages`, `range`, `target`, `delay` (default `penalty`)

#### 3. `src/test/tnc-simulation.test.ts` (신규)
`defect-simulation.test.ts` 5개 테스트(A/B/C/D 모드 + lag) 동일 형식으로 4 stage 데이터에 맞춰 작성.

### 라우팅 / 사이드바

#### `src/App.tsx`
- `<Route path="/tc/simulation" element={<TncSimulationPage />} />` 추가

#### `src/components/layout/AppSidebar.tsx`
- T&C 메뉴 그룹에 `{ label: 'Simulation', icon: FlaskConical, path: '/tc/simulation' }` 추가
- Defect와 동일하게 **Senior User 이상**만 노출 (`role-permissions.ts`의 simulation 권한 키 재사용)

### `src/lib/role-permissions.ts`
- 기존 `defects/simulation` 권한 항목 옆에 `/tc/simulation`도 동일 minRole(`senior_user`)로 등록

### 범위 외
- Excel export, 차트 비교 라인, 학습 lag 보강 등 — Defect 쪽에도 없으므로 미포함
- `subtests` 스키마 변경 없음 (읽기 전용)

### 검증
- 신규 vitest 케이스 통과
- 프리뷰에서 `/tc/simulation` 진입 → 4 stage 카드 + 라인 차트 + 팀 테이블 정상 렌더, Delay handling 드롭다운(default Penalty) 동작 확인
