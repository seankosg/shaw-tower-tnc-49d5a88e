

## Schedule 페이지 속도 개선 계획

### 진단

| 병목 | 영향 |
|---|---|
| **1. DOM 폭발** — Day×74일×N시스템(×3 stages 펼침) → 셀당 5개 div = 수천~수만 노드 한 번에 렌더 | 스크롤 jank·초기 페인트 지연의 주범 |
| **2. 매 방문마다 풀 fetch** — 캐시 없음, `predecessor_status_raw`(text) 포함 1000행씩 페이징 | 첫 진입 2~5초 대기 |
| **3. `today` recompute** — `todayIso()` 매 렌더 호출 → useMemo 재계산 트리거 | 토글마다 전체 aggregate 재실행 |
| **4. `ScheduleCell` 무거움** — 셀마다 absolute-position 3개 div + 2개 텍스트 + cn() 계산 | 각 셀 비용 × 수천 |
| **5. ref warning** — `RiskRow`/`Section`이 함수형인데 Card에 ref 전달 시도 | 콘솔 경고 (기능 영향 적음) |

### 해결책 (효과 큰 순)

#### A. 가로 가상화 (Virtualization) — **가장 큰 효과**
`@tanstack/react-virtual` 의 horizontal virtualizer 도입. 화면에 보이는 ~15개 날짜 셀만 렌더, 나머지는 spacer. 현재 row당 74개 → 15개로 약 **5배 감축**. 펼침 sub-row까지 포함하면 체감 속도 대폭 개선.
- 세로 가상화는 그룹 수가 보통 30~50개라 불필요 (오히려 sticky 복잡도만 증가). 가로만.

#### B. 캐시 도입
`subtest-cache.ts` 패턴 따라 `schedule-cache.ts` 신규. 60초 TTL 동안 재방문 시 즉시 렌더 + 백그라운드 refresh. 페이지 진입 체감 즉시화.

#### C. `ScheduleCell` 경량화
- 빈 셀(plan=0, actual=0)은 `<div />` 단순 placeholder만 (현재는 "·" 텍스트 div). 빈 셀 비율이 매우 높음 (대부분 날짜는 plan 0).
- `cn()` 호출 줄이고 className 정적 분기.
- Delta 0일 때 div 자체 생략.

#### D. `today` 안정화
`SchedulePage`에서 `const today = useMemo(() => todayIso(), [])` 로 마운트 시 1회 고정.

#### E. `aggregateSchedule` 미세 최적화
- `groupMap` 순회 시 빈 stage(전체 plan=0 & actual=0)는 cells 배열 push 생략 가능 — 그러나 매트릭스에서 인덱스 매칭 필요해 구조 유지. 대신 **inner loop의 `bucketize` 호출 결과를 subtest별로 캐시** (3 stage × 같은 날짜면 동일).
- 사실 가장 큰 비용은 렌더이므로 aggregate은 현 상태로도 충분.

#### F. 컴포넌트 메모이제이션
- `ScheduleCell` 을 `React.memo` 로 감싸서 props 동일 시 재렌더 skip.
- `CriticalWatchlist` 도 `React.memo`.

#### G. ref warning 수정
`Section`, `RiskRow`를 `React.forwardRef` 로 감싸기 (또는 Card ref 전달 차단). 빠른 수정.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/components/schedule/ScheduleMatrix.tsx` | 가로 virtualizer 적용 (헤더+본문 모두), spacer div 좌/우 |
| `src/components/schedule/ScheduleCell.tsx` | empty 단순화, memo 적용, delta 0 생략 |
| `src/components/schedule/CriticalWatchlist.tsx` | memo + forwardRef |
| `src/lib/schedule-cache.ts` | 신규 — TTL 캐시 |
| `src/pages/SchedulePage.tsx` | 캐시 사용, `today` useMemo 1회, range 기본값 검토 |

### 라이브러리
- `@tanstack/react-virtual` — 이미 SubtestList에서 사용 중. 추가 설치 불필요.

### 검증
1. Day 60일 × 30 그룹 첫 진입: 5초 → 1초 이내
2. 가로 스크롤 부드러움 (60fps 근접)
3. Group/Bucket/Stage 토글 < 200ms
4. 재방문 시 즉시 표시 (캐시 hit)
5. 콘솔 ref warning 사라짐
6. 시스템 행 펼침 후에도 스크롤 부드러움
7. 셀 클릭 / Today 강조 / sticky 헤더·좌측 컬럼 정상

### 비변경
DB / RLS / Edge Functions / Dashboard / SubtestList / 라우팅

