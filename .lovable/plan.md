# Defect Dashboard 보조 섹션 lazy 계산화

## 배경

이전 작업에서 S-Curve(`scurveOpen`)와 Breakdown 활성 탭만 계산하도록 정리했지만, 아래 3개 보조 분석 블록은 **항상 무조건 계산·렌더**되고 있어 최초 로딩 비용에 그대로 포함됩니다.

| 섹션 | 현재 상태 | 최초 로딩 비용 |
|---|---|---|
| Distribution Pies (Actual/Closure 도넛) | `actualPie`, `closurePie` `useMemo` 항상 실행 (`filteredItems` O(N) 2회 + PieChart 2개 렌더) | 중 |
| HDEC's Basis of Cat B (Reason Distribution) | `Collapsible`로 감싸져 있지만 `open=true` 기본값. Cat B reason 집계 + bar chart 항상 계산·렌더 | 중~상 |
| Captured By Stats Section | `Collapsible` 래퍼 자체가 없음. `CapturedByStatsSection` 내부 집계 항상 실행 | 상 |

## 변경 내용

### A. 공통 패턴

각 섹션에 `open` state 추가(기본 `false`) + localStorage 영속화(사용자가 한 번 펼치면 다음 진입에도 유지). 무거운 `useMemo`/자식 컴포넌트는 `open === true`일 때만 계산·마운트.

```text
const [xOpen, setXOpen] = useState<boolean>(() => {
  try { return localStorage.getItem('defect-dashboard.x.open') === '1'; } catch { return false; }
});
useEffect(() => {
  try { localStorage.setItem('defect-dashboard.x.open', xOpen ? '1' : '0'); } catch {}
}, [xOpen]);
```

### B. Distribution Pies (Actual/Closure)

- `actualPie`/`closurePie` `useMemo`에 `if (!pieOpen) return EMPTY;` 가드 추가.
- 렌더 부분을 `Collapsible`로 래핑, 헤더만 항상 표시(`Distribution` 제목 + chevron). 펼치면 첫 1회 계산 후 메모 캐시.

### C. HDEC's Basis of Cat B

- 기존 `catDisputeOpen` 초기값을 `true` → **`false`(localStorage 우선)** 로 변경.
- IIFE 내부의 sorted/top/rest/chartTop 계산이 이미 `CollapsibleContent` 내부에 있으므로 collapse 시 자동 스킵됨. 추가 가드 불필요.

### D. Captured By Stats Section

- `CapturedByStatsSection` 호출을 `Collapsible`로 감싼다(헤더: "Captured By Stats" + chevron, 기본 접힘).
- `<CollapsibleContent>` 내부에 자식을 두면 closed 상태에선 React가 마운트하지 않아 내부 모든 `useMemo`/집계가 실행되지 않음 — 별도 prop 변경 불필요.

### E. 표시·기능 동등성

- 펼친 상태의 UI/숫자/클릭 동작 100% 동일.
- 접힌 상태에서는 헤더만 노출. 한 번 펼치면 localStorage에 기억돼 다음 진입 시 자동 펼침.
- KPI 카드, Cat A/B 요약 카드, Plan vs Actual Summary, Breakdown 탭, S-Curve(기존 정책 유지)는 손대지 않음.

## 예상 효과 (N=5,000 기준)

- 최초 진입 시 **PieChart 2개 + Cat B distribution + Captured By 전체 블록** 렌더·계산 생략.
- recharts PieChart 인스턴스 2개 마운트 회피 → 메인 스레드 ~수십~수백 ms 절약(저사양 PC에서 체감 큼).
- Captured By 내부 집계가 가장 큼(보고자별 그룹 + 멀티 메트릭) — 제거 시 필터 변경 응답도 함께 빨라짐.
- 사용자가 평소 보는 사람만 펼치고 보면 일상 사용 시 비용도 영구히 감소.

## 변경 파일

- `src/pages/DefectDashboardPage.tsx` — 위 A~D 적용 (단일 파일)

## 비기능

- 회귀: 기존 `src/test/defect-dashboard-utils.test.ts` 통과 유지(계산 로직 자체는 미변경).
- 디자인: 헤더 chevron 패턴은 기존 S-Curve / Cat Dispute 토글과 동일한 시각 언어 사용.

승인 시 단일 파일 수정으로 진행합니다.
