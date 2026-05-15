## 목표

Report 탭의 "Stage Progress Snapshots" 표(날짜별 진도율)가 현재는 단순히 `actual_date ≤ snapshot date` 카운트만 사용 중. 이를 **Simulation 탭과 동일한 로직**(`simulateAllTncStages` / `simulateAllDefectStages`)으로 교체해 미래 날짜에도 예측치(Predicted %)가 같이 나오도록 함.

T&C와 Defect만 Simulation 모듈이 존재하므로 두 모듈에 적용. Docs / Punch 스냅샷은 기존 actual-date 기반 로직 유지.

## 변경 사항

### 1) `src/lib/report-builder.ts`

- `ReportOptions`에 추가:
  - `delayMode?: 'optimistic' | 'penalty'` (기본 `'penalty'` — Simulation 페이지 기본값과 동일)
  - `dataDate?: string` (없으면 자동 결정 — 아래 참조)
- T&C / Defect fetch를 `select('*')`로 변경 → Simulation 엔진이 요구하는 모든 컬럼(`SubtestForDashboard` / `DefectItem`) 확보. `is_active=true` 필터 유지.
- `dataDate` 미지정 시 fetch 단계에서 actual 컬럼들 중 가장 최근 ISO를 골라 자동 결정 (Simulation 페이지의 `useLatestSubtestDataDate` / `useLatestDataDate`와 같은 의미). 둘 다 없으면 오늘 날짜 fallback.
- 스냅샷 표 계산을 다음으로 교체:
  - T&C: `simulateAllTncStages(rows, snapshot, { mode: delayMode, dataDate, enforceSequential: true }, ['t1','t2','r1','r2s'])`
  - Defect: `simulateAllDefectStages(rows, snapshot, { mode: delayMode, dataDate }, ['start','completion','closure'])`
- 표 컬럼: 각 스테이지마다 `Predicted %`(메인) + `Actual %` 부가 표기. 표 위에 `mode = Worst Case`, `data date = YYYY-MM-DD` 메타 한 줄 추가해 LLM이 해석 가능하도록 함.
- T&C R2S는 Simulation 엔진의 `'r2s'` 키 사용 (기존 단순 `r2_actual_submission_date` 카운트 대체).
- Docs / Punch 스냅샷, Dashboard / Progress / Simulation 요약 섹션은 그대로 유지.

### 2) `src/pages/admin/ReportTab.tsx`

- "Delay handling" Select 추가 (Best Case / Worst Case, 기본 Worst Case) → `delayMode` 상태로 보관 후 `buildReportMarkdown` 옵션으로 전달.
- "Data date (override)" date input 추가 — 비워두면 자동 결정. 아래에 헬퍼 텍스트 "leave empty to use latest actual date" 안내.
- 기존 컨트롤(modules / sections / snapshot dates / MC date)은 그대로.

## 검증

- Simulation 탭에서 특정 target date의 Predicted %를 확인한 뒤, Report 탭에서 같은 날짜를 스냅샷에 추가하고 동일한 모드(Worst Case)로 생성한 Markdown 표 값과 일치하는지 비교.
- 과거 날짜(예: 2026-04-01)는 Predicted % ≈ Actual %, 미래 날짜(예: 2026-06-14)는 mode에 따라 값이 달라지는지 확인.
