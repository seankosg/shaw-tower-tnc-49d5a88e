

## Schedule 타임라인 "과거 날짜 접기" 토글

### 목적
오늘 이전(어제까지) bucket 컬럼을 한 번에 접어서 가로 스크롤 없이 미래 계획 위주로 볼 수 있게.

### UI 위치
SchedulePage 상단 컨트롤 바(Bucket Day/Week 토글 옆)에 토글 버튼 추가:
- `[ « Hide past ]` ↔ `[ » Show past ]`
- 기본값: 펼침(현재 동작 유지)

### 동작
- **접힘 상태**: `data.buckets`에서 `bucket < today`인 컬럼을 모두 숨김. 행의 `combined`/`stages.cells`도 같은 인덱스로 슬라이스. 좌측 sticky 요약 컬럼(Total Scope / Up to Today)은 그대로 유지 → 과거 누적 정보는 숫자로 계속 보임.
- **폈을 때**: 기존과 동일.
- 토글 시 자동 스크롤 로직(`todayBucketIdx` 기반)이 그대로 today를 좌측에 위치시킴.

### 구현 방식
1. `SchedulePage.tsx`
   - `const [hidePast, setHidePast] = useState(false)` 추가, localStorage에 저장(`schedule_hide_past`).
   - 컨트롤 바에 `Button`(variant=outline, size=sm) + 아이콘(`ChevronsLeft`/`ChevronsRight`) 추가.
   - `aggregate` 결과를 `useMemo`로 한 번 더 가공: `hidePast`이면 `today` 미만 인덱스를 잘라낸 새 `AggregateResult` 생성.
2. `ScheduleMatrix.tsx` — 변경 없음 (이미 `data.buckets` 길이에 따라 렌더). `today`도 그대로 전달.
3. `CriticalWatchlist` 등 다른 컴포넌트 영향 없음(원본 `aggregate` 사용).

### 가공 로직 (SchedulePage 내)
```ts
const visibleData = useMemo(() => {
  if (!hidePast) return aggregate;
  const startIdx = aggregate.buckets.findIndex(b => b >= today);
  if (startIdx <= 0) return aggregate;
  const buckets = aggregate.buckets.slice(startIdx);
  const rows = aggregate.rows.map(r => ({
    ...r,
    combined: r.combined.slice(startIdx),
    stages: {
      pred: { ...r.stages.pred, cells: r.stages.pred.cells.slice(startIdx) },
      t1:   { ...r.stages.t1,   cells: r.stages.t1.cells.slice(startIdx) },
      t2:   { ...r.stages.t2,   cells: r.stages.t2.cells.slice(startIdx) },
    },
  }));
  return { ...aggregate, buckets, rows };
}, [aggregate, hidePast, today]);
```

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/pages/SchedulePage.tsx` | hidePast state + 토글 버튼 + visibleData 가공 + ScheduleMatrix에 visibleData 전달 |

### 검증
1. Day 모드에서 토글 → 어제까지 컬럼 사라지고 today가 좌측 첫 컬럼.
2. Week 모드에서 토글 → today가 속한 주부터 표시.
3. 좌측 Total Scope / Up to Today 숫자는 변화 없음(원본 aggregate 사용).
4. 토글 상태 새로고침 후 유지(localStorage).
5. 셀 클릭 필터링은 today 이후 셀에서 정상 동작.

