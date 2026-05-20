# Captured By 섹션이 비어 보이는 문제 수정

## 원인

DB 확인 결과 Design 팀 7건 모두 `captured_by_name`이 채워져 있음 (Penn Theen 1, Lawrence Lau 6). 그런데 화면은 "No Captured By data available." 만 표시.

두 가지 문제가 겹쳐 있음:

1. **React Hook 순서 버그 (확실)**
   `CapturedByStatsSection`(`src/pages/DefectDashboardPage.tsx` ~751행)에서
   ```text
   if (stats.length === 0) return <Card>...</Card>;   // early return
   const grouped = useMemo(...)                        // ← 이 hook이 조건부 호출됨
   ```
   - stats가 비어있다 → 채워진다 로 바뀌는 순간 hook 개수가 달라져 React가 "Rendered more hooks than during the previous render" 에러를 던지거나, 이전 렌더에서 그룹화 결과를 못 만들고 빈 카드만 계속 표시됨.

2. **캐시 정합성 (의심)**
   Captured By 그룹 기능을 추가하면서 `SLIM_COLUMNS`에 `captured_by_name`을 새로 넣었음. 사용자가 같은 탭을 열어둔 채 HMR로 코드가 갱신되면, 모듈 스코프 `defect-cache` 상태가 이전 SELECT 결과(컬럼 없음) 그대로 남아 있을 수 있음. 새 컬럼은 incremental refresh에서 변경 행에만 채워짐.

## 수정 사항

### 1) Hook 순서 정리 — `src/pages/DefectDashboardPage.tsx`

`CapturedByStatsSection` 내부에서:

- `grouped`의 `useMemo`를 `stats` 계산 직후, early return **이전**으로 이동.
- 그 다음에 `if (stats.length === 0) return <빈 카드>` 를 둠.
- 렌더 본문은 `grouped`를 그대로 사용.

이 변경만으로 stats가 늦게 도착해도 안전하게 재렌더되어 그룹 카드가 나타남.

### 2) 캐시 강제 동기화 — `src/lib/defect-cache.ts`

- `SLIM_COLUMNS` 버전을 하나 올려, 모듈 첫 로드 시 캐시를 한 번 무효화하도록 작은 가드를 추가:
  - 모듈 상단에 `const CACHE_SCHEMA = 'v2-captured-by';` 상수.
  - `bindRealtime()` 직전에 `sessionStorage`로 저장된 스키마 키와 비교하여 다르면 `invalidateDefectCache()` 후 키 업데이트.
  - 결과: 사용자 새로고침 한 번이면 전체 슬림 페치가 다시 돌아 `captured_by_name`이 모든 행에 채워짐.

## 검증

1. Design 팀 탭에서 Captured By 섹션에
   - Arch 그룹: Penn Theen (Total 1)
   - Facade 그룹: Lawrence Lau (Total 6)
   이 표시되는지 확인.
2. 그룹 헤더 클릭 → Raw Data로 `capturedByGroup=Arch/Facade` 필터 이동 확인.
3. 다른 팀(Mech/Elec/Arch)에서도 카드들이 그룹별로 분리되어 나오는지 확인.
4. 콘솔에 hook 관련 경고가 사라졌는지 확인.
