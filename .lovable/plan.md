## 원인

Analysis Dashboard 의 Productivity 표/카드가 사용하는 두 쿼리가 Supabase 의 기본 max-rows=1000 제한에 걸려 데이터가 잘리고 있습니다.

- `subtests` 실제 행수: **1,789** → 1,000 만 반환됨 (`.limit(50000)` 은 클라이언트 요청값일 뿐, 서버가 1000 으로 잘라냄)
- `defect_items` 실제 행수: **6,234** → 1,000 만 반환됨 (약 1/6)
- `dmr_entries` 909행은 영향 없음

검증:
- 5/22 Defect Mero 실제 DB → Planned 12, Actual 45 (raw data 와 일치)
- 1000/6234 ≈ 16% 만 들어오므로 12×0.16≈2, 45×0.16≈7 → Dashboard 가 보여주는 **Plan 1, Actual 8** 와 일치 (truncation 으로 인한 손실)

T&C 쪽도 1789→1000 으로 잘리므로 동일 증상이 발생할 수 있습니다.

## 수정 계획

`src/components/analysis/ProductivityTable.tsx` 와 `src/components/analysis/ProductivitySummaryCards.tsx` 에서 사용하는 두 쿼리(`subtests`, `defect_items`)를 페이지네이션 fetch 로 교체합니다.

### 1) 공용 헬퍼 추가

`src/lib/fetch-all-rows.ts` 에 범용 페이지네이션 함수를 추가:

```ts
export async function fetchAllRows<T>(
  build: (from: number, to: number) => any, // PostgREST builder
  pageSize = 1000,
): Promise<T[]>
```

내부에서 `.range(from, to)` 를 반복 호출하며 batch.length < pageSize 일 때 중단. 안전 상한 100회.

### 2) ProductivityTable 의 두 useQuery 교체

- `subtests` 쿼리: `is_active=true` 필터 + 필요한 컬럼 select 를 `fetchAllRows` 로 감싸 전체 행 로딩.
- `defect_items` 쿼리: 동일하게 페이지네이션.
- 캐시 키는 그대로 유지 (`productivity_subtests`, `productivity_defects`).

### 3) ProductivitySummaryCards 의 동일 두 쿼리 교체

같은 방식으로 paging 적용. 두 컴포넌트가 같은 queryKey 를 사용하면 react-query 캐시를 공유하므로 네트워크 부하는 한 번에 그칩니다 (현재도 키가 동일하면 캐시 공유). 키를 통일.

### 4) 검증

- 빌드 통과 확인
- Dashboard 에서 Mero 5/22 Defect Planned=12, Actual=49 (Arch 45 + Mech 4) 표시 확인. (Note: defect_items 에 `Mero/Arch` 45건과 `MERO/Mech` 4건이 함께 있어 합산되며, normalize 가 case-insensitive 이므로 두 표기가 같은 행으로 합쳐집니다 — 의도된 동작.)

## 영향 범위

- UI/표시 로직은 변경 없음, 데이터 fetch 만 페이지네이션으로 교체
- 한 번에 최대 6,234 / 1000 = 7 회 fetch (defect_items). 첫 로드에 약간의 지연이 추가되나 react-query 캐시로 이후엔 즉시 표시
