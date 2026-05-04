## Docs Dashboard 데이터 로딩 수정

### 문제
- ABD 카드의 Total이 1000으로 표시되나, 실제 DB에는 4,803건 존재
- 원인: `src/lib/docs-dashboard-data.ts`가 `.select(...)`만 사용 → PostgREST 기본 1000행 제한에 걸림
- T&C / Defect 대시보드는 이미 1000행 client-side pagination 패턴 사용 중

### 변경 내용 (Option A — 프로젝트 기존 컨벤션 따름)

**파일: `src/lib/docs-dashboard-data.ts`**

각 모듈별 fetch 함수를 1000행 페이징 루프로 변경:

```text
fetchAllRows(table):
  rows = []
  PAGE = 1000
  for from = 0; ; from += PAGE:
    data = supabase.from(table)
      .select(...필요컬럼)
      .eq('is_active', true)
      .range(from, from + PAGE - 1)
    rows.push(...data)
    if (data.length < PAGE) break
  return rows
```

세 모듈(`docs_drawings`, `docs_omm`, `docs_spare_part`)은 `Promise.all`로 병렬 실행.

### 영향
- ABD Total: 1000 → **4,803** (정확)
- OMM / Spare Parts 카드 Total도 정확한 값으로 갱신
- Risk matrix, Top overdue 리스트, Cross-cut(Subcontractor/PIC/Trade) 집계, Trend chart 모두 전체 데이터 기반으로 재계산
- 페이지 진입 시 모듈당 약 5회 round-trip (3모듈 병렬, 총 ~5초 이내 예상)

### 변경하지 않는 것
- 기존 카드/차트 UI 컴포넌트 그대로
- 기존 집계 로직(상태 분류, overdue 판정) 그대로
- Warranty placeholder 그대로
