
## Recalculate 버튼 — Defect & T&C Simulation

### 현재 동작
- 두 페이지(`DefectSimulationPage`, `TncSimulationPage`)는 마운트 시 1회 모든 Raw Data를 fetch (페이지네이션 1000행 단위 루프).
- Raw Data에서 일정을 바꿔도 시뮬 페이지에 머물러 있는 동안엔 반영되지 않음.

### 변경 요지
- 최초 진입 시: **자동 1회 로드** (기존과 동일).
- 이후: **"Recalculate" 버튼** 으로만 재fetch. 컨트롤(Target/Team/Stages/Range/Delay)은 메모리상에서 즉시 반영 (현재와 동일).
- "Last calculated" 타임스탬프를 헤더에 표시해 데이터 신선도를 명확히 보여줌.

### 구현 (두 페이지 동일 패턴)

**1. State 추가**
- `lastCalcAt: Date | null` — fetch 완료 시각.
- `loading` 은 fetching 상태로 의미 유지.

**2. fetch 로직 분리**
- 기존 `useEffect` 내부 IIFE를 `loadData()` 함수로 추출.
- mount 시 1회 호출 + Recalculate 버튼 onClick 에서 호출.

**3. UI**
- 툴바 우측 끝에 `Recalculate` 버튼 (`RefreshCw` 아이콘).
- 클릭 시 spinner (`loading` 동안 disabled + 회전 애니메이션).
- 헤더 한 줄 추가: `Last calculated: 14:32:05` (없으면 표시 안 함).

**4. 그 외 변경 없음**
- 시뮬 로직, 차트, 테이블, URL 파라미터, 권한 — 모두 그대로.

### 적용 파일
- `src/pages/DefectSimulationPage.tsx`
- `src/pages/TncSimulationPage.tsx`

### 검증
- 프리뷰에서 Raw Data 일정 변경 → 시뮬 페이지로 이동 → 수치 변하지 않음 → Recalculate 클릭 → 갱신되는지 확인.
- Last calculated 타임스탬프 갱신 확인.

### 범위 외
- React Query 도입 / staleTime 기반 자동 invalidation — 향후 과제.
- Realtime 구독 — 비용 대비 효익 낮음.
