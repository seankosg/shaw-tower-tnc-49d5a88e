## 1. 근본 원인 (확정)

`src/pages/analysis/DmrDashboardPage.tsx`의 `dmr_entries` 조회가 Supabase PostgREST의 서버 측 기본 응답 캡(1000행)에 걸려 최신 일자 행이 잘립니다.

- `dmr_entries` 총 1029행 (1000 초과)
- 쿼리: `.order('report_date', { ascending: true }).limit(10000)`
- 클라이언트의 `.limit(10000)`은 URL 파라미터일 뿐 서버 `max_rows=1000`을 넘지 못함
- 오름차순 정렬이라 잘리는 행은 **가장 최신 일자(2026-05-25)**의 ACU/타 협력사 행들
- 결과: `dates` 배열에 25-May가 없어서 컬럼 자체가 안 생기고, ACU Defect 11명도 표시 누락

## 2. 추가 검토 — 같은 패턴의 잠재 버그

`.limit(N)`에 큰 수를 적어 "전체 가져오기"를 시도하지만 1000행에서 잘리는 위치 (높은 우선순위순):

| 파일 | 라인 | 테이블 | 현재 행 수 | 영향 |
|---|---|---|---|---|
| `pages/analysis/DmrDashboardPage.tsx` | 160 | dmr_entries | 1029 | **확인됨** — 대시보드 최신일 누락 |
| `pages/analysis/DmrRawDataPage.tsx` | 62 | dmr_entries | 1029 | DMR Raw Data 페이지에서도 일부 누락 가능 |
| `pages/ExportPage.tsx` | 52 | subtests | 1802 | **Subtest Export CSV가 1000행에서 잘림 — 데이터 손실** |
| `pages/DefectDetailPage.tsx` | 126 | defect_items | 6322 | Combobox 자동완성 후보 누락(품질만 영향) |
| `pages/docs/DocsDrawingDetailPage.tsx` | 205 | docs_drawings | 3882 | 동일 — 자동완성 후보 누락 |
| `pages/admin/EventLogTab.tsx` | 130 | event_log | 167,106 | Event Log CSV Export가 1000행에서 잘림 |

참고: `defect_items` 카드 캐시(`src/lib/defect-cache.ts`)와 `Import Logs` 조회(`fetchAllByUploadId`)는 이미 페이지네이션이 적용되어 안전합니다. `.limit(1/5/50/100)`처럼 의도적 상한은 모두 정상입니다.

## 3. 수정 내용

### 3-1. (즉시 해결) DmrDashboardPage
`useQuery` queryFn을 `fetchAllRows`로 교체:
```ts
import { fetchAllRows } from '@/lib/fetch-all-rows';

queryFn: async (): Promise<Row[]> =>
  fetchAllRows<Row>((from, to) =>
    supabase
      .from('dmr_entries')
      .select('report_date, team, trade, subcontractor, workplace, manpower')
      .order('report_date', { ascending: true })
      .range(from, to),
  ),
```

### 3-2. 같은 패턴의 다른 5곳도 페이지네이션 적용
모두 동일 패턴이므로 `fetchAllRows`로 교체:

- `DmrRawDataPage.tsx:55-67` — `load()` 내부
- `ExportPage.tsx:52` — `query.limit(5000)` 호출 부분 (Subtest 전체 export)
- `DefectDetailPage.tsx:121-126` — 자동완성 풀 조회
- `DocsDrawingDetailPage.tsx:200-205` — `poolRes` 조회
- `admin/EventLogTab.tsx:122-138` — `exportCsv()`의 5000행 제한 export

각 위치에서 기존 `.limit(N)` + 후속 `.then/await`을 `fetchAllRows`의 builder 패턴으로 바꿉니다. 정렬·필터 체인은 그대로 유지하고 마지막에 `.range(from, to)`를 붙입니다. (EventLogTab은 5000행 상한이 정책이라면 `fetchAllRows` 호출부에 카운터를 두고 5000 도달 시 break하는 방식으로 의도 유지)

## 4. 검증

수정 후 DMR Dashboard에서 Subcontractor=ACU 필터 시:
- Productivity 테이블 첫 컬럼이 **25-May**로 노출
- Defect Actual의 Man 셀에 **11** 표시
- Daily Manpower by Trade 차트에도 25-May 데이터 포인트 추가

추가로 Subtest Export, Event Log Export 결과 행 수가 실제 DB 행 수와 일치하는지 다운로드 파일로 확인합니다.
