# Defect Dashboard — Dispute 서머리 배너 2종 추가

Defect 대시보드 상단 Priority Category 카드(`Total / Cat. A / Cat. B / No Cat.`) 바로 아래 tier에 두 개의 요약 배너를 추가한다. 데이터는 현재 `filteredItems`(팀 필터 적용된 결과)를 그대로 사용한다.

## 배너 1 — "Dispute in Category"

가로 3분할 카드(혹은 단일 Card 내 3개 셀):
- **LL's CAT A** — `priority === 'Cat A - Major Defect (Before SC)'` AND `closure_status !== 'Done'` 인 항목 수
- **HDEC's CAT A** — `hdec_verification === 'Cat A - Major Defect (Before SC)'` AND `closure_status !== 'Done'` 인 항목 수
- **Difference** — `LL's CAT A − HDEC's CAT A` (양수: HDEC가 등급 강하 시킨 수, 음수면 빨간색)

클릭 동작(기존 KPI 카드 패턴과 동일):
- LL's CAT A → `goRaw({ priority: 'Cat A - Major Defect (Before SC)', closureStatus: '__NOT_DONE__' })`
- HDEC's CAT A → `goRaw({ hdecVerification: 'Cat A - Major Defect (Before SC)', closureStatus: '__NOT_DONE__' })`
- Difference → 비클릭

## 배너 2 — "HDEC's Basis of Dispute"

대상 집합: `closure_status !== 'Done'` AND `hdec_verification === 'Cat B - Minor Defect'` 인 행.

표시 방식: `hdec_reason` 값별로 그룹핑하여 (reason, count) 리스트를 카드 내부에 chips/리스트로 노출.
- 정렬: count 내림차순, 동률이면 reason 알파벳순.
- 빈/null reason은 `Unspecified` 레이블로 묶음.
- 각 항목 클릭 시 → `goRaw({ hdecVerification: 'Cat B - Minor Defect', hdecReason: <reason 혹은 __EMPTY__>, closureStatus: '__NOT_DONE__' })`.
- 대상 0건이면 "No disputes recorded." 안내문 표시.

## 변경 파일

1. `src/pages/DefectDashboardPage.tsx`
   - `kpis` useMemo 내부에 `dispute` 객체 추가:
     ```ts
     const NOT_DONE = (i) => i.closure_status !== 'Done';
     const llCatA   = filteredItems.filter(i => i.priority === CAT_A && NOT_DONE(i)).length;
     const hdecCatA = filteredItems.filter(i => (i as any).hdec_verification === CAT_A && NOT_DONE(i)).length;
     const hdecCatBReasons = (() => {
       const m = new Map<string, number>();
       for (const i of filteredItems) {
         if (!NOT_DONE(i)) continue;
         if ((i as any).hdec_verification !== CAT_B) continue;
         const r = ((i as any).hdec_reason || '').trim() || '__EMPTY__';
         m.set(r, (m.get(r) ?? 0) + 1);
       }
       return Array.from(m.entries()).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
     })();
     ```
   - Priority 카드 grid(라인 428-449) 직후, `CapturedByStatsSection` 앞에 두 배너 JSX 삽입.
   - `goRaw` 호출에 새 쿼리키 사용 (아래 2번 항목과 짝).

2. `src/pages/DefectRawDataPage.tsx` (및 `defect-dashboard-utils` 필요 시)
   - URL 쿼리 파라미터 신규 지원:
     - `hdecVerification=<exact value>` — 정확 일치 필터
     - `hdecReason=<exact value | __EMPTY__>` — 정확 일치 (빈 토큰 시 null/공백 매칭)
     - `closureStatus=__NOT_DONE__` — 기존 `closureStatus=InD` 같은 단일 값 분기에 "Done이 아닌 전체" 토큰 추가
   - Active filter chips에도 신규 3종 표시 + 제거 가능하도록 추가.

## 비고

- 데이터/RLS/DB 변경 없음. 모두 클라이언트 필터링.
- `closureStatus=__NOT_DONE__`는 신규 sentinel. 기존 값(`Done/Delay/WIP/Planned/InD`)과 충돌하지 않음.
- 배너 디자인은 기존 KpiCard 스타일에 맞춰 작은 카드 2개(grid `md:grid-cols-2`)로 배치.
