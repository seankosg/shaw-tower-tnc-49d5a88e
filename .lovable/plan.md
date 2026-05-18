# Dashboard 날짜 포맷 통일 계획

## 목표

모든 Dashboard의 날짜 표시를 한 가지 규칙으로 통일:
- **올해 날짜** → `dd-MMM` (예: `15-Jan`)
- **올해가 아닌 날짜** → `dd-MMM-yyyy` (예: `15-Jan-2027`)

현재 Punch Dashboard에만 이 "smart" 규칙이 로컬 함수로 들어가 있고, 나머지 Dashboard들은 `formatDdMmm`(연도 없음) 또는 `date-fns`의 `yyyy-MM-dd`를 섞어 쓰고 있어 일관성이 없습니다.

## 현재 상태 (점검 결과)

| 파일 | 사용 함수 | 문제 |
|---|---|---|
| `src/pages/PunchDashboardPage.tsx` | 로컬 `formatDashDate` (smart) | 로컬 함수 — 공용화 필요 |
| `src/pages/DashboardPage.tsx` (TnC) | `formatDdMmm` | 연도 없음 — 다른 해 일정 혼동 |
| `src/pages/DefectDashboardPage.tsx` | `formatDdMmm` | 연도 없음 — 동일 |
| `src/pages/docs/DocsDashboardPage.tsx` | `date-fns format('yyyy-MM-dd')` | 포맷 다름 |
| `src/pages/docs/DocsExecutiveDashboardPage.tsx` | `date-fns format('yyyy-MM-dd')` | 포맷 다름 |

## 변경 사항

### 1. 공용 util 추가 — `src/lib/format.ts`

```ts
export const formatDdMmmSmart = (v: string | null | undefined): string => {
  // 올해 → dd-MMM, 그 외 → dd-MMM-yyyy
}
```
기존 `formatDdMmm`, `formatDdMmmYyyy`는 그대로 유지 (S-Curve 축, 윈도우 라벨처럼 항상 dd-MMM이어야 하는 곳에 계속 사용).

### 2. Dashboard 페이지 일괄 교체

**A. PunchDashboardPage.tsx**
- 로컬 `formatDashDate` / `MONTH_ABBR` 제거 → `formatDdMmmSmart`로 대체
- 적용 위치: 헤더 메타칩(Earliest/Latest), Top Overdue 테이블의 Planned date

**B. DashboardPage.tsx (TnC)**
- KPI/표/매트릭스 등 **개별 날짜 셀** 표시는 `formatDdMmm` → `formatDdMmmSmart`
- **S-Curve 축 라벨/Today 라인/Data Date·Today 칩**은 기존 `formatDdMmm` 유지 (축 가독성)

**C. DefectDashboardPage.tsx**
- 동일 원칙: 개별 날짜 셀은 `formatDdMmmSmart`, Data Date/Today 칩과 윈도우 라벨(`windowStart ~ windowEnd`)은 기존 `formatDdMmm` 유지

**D. DocsDashboardPage.tsx / DocsExecutiveDashboardPage.tsx**
- 헤더 `Data Date: yyyy-MM-dd` → `formatDdMmmSmart(asOf)` 사용
- `date-fns` import 제거 (다른 용도 없으면)

### 3. 적용 범위 경계

- **개별 일정 날짜 셀**(Planned/Actual/Earliest/Latest 등)은 모두 `formatDdMmmSmart`로 통일.
- **차트 X축 라벨, 누적 윈도우 라벨, S-Curve Today 표시** 등 "공간 절약·차트 가독성"이 우선인 곳은 기존 `formatDdMmm`(연도 없음) 유지 — 사용자의 "현재 방식 유지" 의도는 메타/표 영역의 smart 포맷이 핵심이므로.
- Raw Data 페이지, Detail 페이지, Export, Import 페이지는 범위 외 (요청은 Dashboard).

## 검증

- 빌드 통과 확인
- Punch / TnC / Defect / Docs 각 Dashboard 프리뷰에서 다음 확인:
  - 올해 날짜 = `15-Jan` 형식으로 표시
  - 내년·작년 날짜 = `15-Jan-2027` 형식으로 표시
  - 차트 X축은 기존처럼 연도 없는 라벨 유지

## 영향 받지 않는 영역

- 데이터베이스, 비즈니스 로직, RLS, Edge Function — 변경 없음
- `formatDdMmm` / `formatDdMmmYyyy` 자체 — 그대로 유지 (다른 곳에서 사용 중)
