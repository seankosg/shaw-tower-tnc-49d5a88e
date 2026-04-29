## 진단

Defect Dashboard에서 **Tier 1 "Completion Done"** 카드를 클릭하면 `/defects/raw-data?source=dashboard&actualComplete=true`로 이동합니다. 데이터 자체는 필터링되어 32 records로 정상 표시되지만, 화면 상단의 **"Active URL filters" 파란 칩 배너가 보이지 않습니다.**

원인: `DefectRawDataPage.tsx`의 `activeUrlFilters` 헬퍼(라인 949–993)가 칩으로 변환하는 파라미터 라벨 맵에 **대시보드가 실제로 보내는 핵심 파라미터들이 누락**되어 있습니다.

| 대시보드가 보내는 param | 데이터 필터링에 사용? | 칩으로 표시? |
|---|---|---|
| `actualComplete=true/false` | ✅ (라인 618) | ❌ 누락 |
| `closureComplete=true/false` | ✅ (라인 621) | ❌ 누락 |
| `overdue=true` + `stage` + `asOf` | ✅ (라인 624) | ❌ 누락 |
| `atRisk=true` + `atRiskDays` | ✅ (라인 665) | ❌ 누락 |
| `source=dashboard` | (마커) | ❌ 누락 (의도된 것) |

T&C(SubtestList) 쪽은 자체 매핑이 따로 있어 영향 없음. 본 수정은 Defect 페이지에만 한정.

## 변경

### `src/pages/DefectRawDataPage.tsx` — `activeUrlFilters` 보강 (라인 949–993)

기존 단순 라벨 맵 루프 다음에 다음 분기들을 추가:

1. **Completion 상태 (`actualComplete`)**
   - `true` → 칩: `Completion: Done ✕`
   - `false` → 칩: `Completion: Open ✕`
   - clears: `['actualComplete']`
   - 단, `closureComplete`도 함께 있으면 "Remain Inspection" 케이스이므로 별도 단일 칩 `Remain Inspection ✕`로 합쳐 표시 (clears: `['actualComplete', 'closureComplete']`)

2. **Closure 상태 (`closureComplete`)** (위 합쳐진 케이스가 아닐 때만)
   - `true` → 칩: `Closure: Done ✕`
   - `false` → 칩: `Closure: Open ✕`

3. **Overdue (`overdue=true`)**
   - `stage` 값에 따라 라벨: `Overdue — Start/Completion/Closure ✕` (stage 없으면 `Overdue ✕`)
   - clears: `['overdue', 'stage', 'asOf']`

4. **At Risk (`atRisk=true`)**
   - `atRiskDays`가 있으면 `At Risk (≤ Nd) ✕`, 없으면 `At Risk ✕`
   - clears: `['atRisk', 'atRiskDays']`

5. **`source` 파라미터**는 칩으로 표시하지 않음 (대시보드 진입 마커 용도). 다만 "Clear all" 동작 시에도 그대로 유지하거나 제거 — 기존 `clearAllUrlFilters` 동작을 따른다.

### 검증 포인트

- Completion Done 카드 진입 시 → `Active URL filters: Completion: Done ✕   Clear all` 배너 표시
- Open Defect → `Completion: Open ✕`
- Remain Inspection → `Remain Inspection ✕` (단일 칩, 두 param 동시 해제)
- Overdue - Completion → `Overdue — Completion ✕`
- At-Risk 배너 → `At Risk (≤ 7d) ✕`
- 칩의 ✕ 클릭 시 해당 param들이 URL에서 제거되고 데이터 카운트가 다시 변경되는지 확인

### 영향 범위

- 표시 레이어만 변경. 기존 데이터 필터링 로직(라인 609 이후)은 그대로 동작.
- T&C(SubtestList) 페이지는 변경 없음.
- 기존에 라벨 맵에 있는 `team`, `subcontractor` 등 단순 칩들도 그대로 동작.
