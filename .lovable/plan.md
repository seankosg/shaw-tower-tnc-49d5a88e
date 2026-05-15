
# Documents Dashboard 확장 계획

기존 자산을 그대로 사용하고 추가 로직만 얹습니다. T&C / Defect 대시보드는 건드리지 않습니다.

재사용 자산
- `src/lib/docs-stage-records.ts` — stage record SSOT, ABD/OMM bucket helpers
- `src/lib/docs-executive-dashboard-data.ts` — 페이지네이션 fetchAll로 모든 행 로딩 (이미 1000행 제한 없음)
- `src/lib/docs-dashboard-filter.ts` — URL param → row id 필터링
- `src/pages/docs/DocsExecutiveDashboardPage.tsx` — 모듈별 섹션 구조
- Raw Data 페이지 3종은 이미 `useSearchParams` + `readDashboardFilterParams`로 드릴다운 처리 중

## 1. Stage record / 헬퍼 확장 (`docs-stage-records.ts`)

새 헬퍼 추가 (기존 함수는 변경하지 않음):

- `summariseByItem`에 `due_this_week: boolean`, `critical_delay: boolean(>30d)` 필드 추가
- `DELAY_BUCKETS = ['0-7','8-14','15-30','30+']` 상수와 `bucketDelayDays(days)` 함수
- `computeDelaySeverityBuckets(records)` → `{ '0-7': n, '8-14': n, '15-30': n, '30+': n }` (item 단위, max_delay_days 기준)
- `computeWarrantyStageBreakdown(records)` → 4 step 별 `{ total, done, remaining, overdue }`
- `computeDataQualityIssues(records, rawAbd, rawOmm, rawWarranty)`
  - missing planned date (어떤 stage든 planned_date 비어있고 not done)
  - missing actual date (is_done인데 actual_date null)
  - missing subcontractor / hdec_pic
  - inconsistent stage data (예: actual 있는데 planned 없음, sub2_actual 있는데 sub1_actual 없음 등 모듈별 룰)
  - 결과: `{ key, label, count, ids: string[] }`

## 2. Dashboard 데이터 로더 (`docs-executive-dashboard-data.ts`)

- 변경 최소화. 기존 fetchAll 페이지네이션 유지
- ABD/OMM select에 누락된 컬럼 보강(Data Quality 검사용): 없는 경우 raw_payload 사용
- warranty raw rows도 caller가 사용할 수 있게 `warrantyRows`를 snapshot에 추가 노출

## 3. 대시보드 페이지 (`DocsExecutiveDashboardPage.tsx`)

상단에 새 섹션을 추가하고 기존 모듈 섹션은 그대로 유지하면서 새 카드를 끼워넣습니다.

A. **Portfolio KPI Strip (신규, 페이지 최상단)**
   6개 클릭 가능 KPI 카드 (전체 모듈 합):
   - Total / Completed / Remaining / Overdue / Due This Week / Critical Delay (>30d)
   - 클릭 시 해당 모듈로 드릴다운하는 대신, 모듈별 동일 카드도 모듈 섹션 안에 두어 모듈 컨텍스트로 이동

B. **모듈 KPI 6카드 (각 모듈 섹션의 SummaryTile 행 확장)**
   - 기존 Total/Done/Overdue → Total/Completed/Remaining/Overdue/Due This Week/Critical Delay 6개로 확장
   - 클릭 시 raw 페이지로 이동: `?status=completed`, `?overdue=1`, `?due_this_week=1`, `?delay_bucket=30+`

C. **Delay Severity Bucket 카드 (모듈별)**
   - 4개 버킷 가로 표시, 각 버킷 클릭 → `?delay_bucket=0-7|8-14|15-30|30+`

D. **Warranty 4-Step Progress (Warranty 섹션)**
   - 기존 generic StageCard 4개를 그대로 사용하되, `Draft / Subcon Sign / HDEC Sign / Final` 라벨/순서가 이미 stage def에 있음
   - 각 카드에 Remaining + Overdue 동시 표시(이미 StageCard 지원). 클릭 시 `?stage=warranty.<key>`

E. **확장 필터 바 (모듈 섹션 내, 기존 Team/Trade Tabs 옆)**
   - Subcontractor 드롭다운 (Select, 'All' + uniq)
   - HDEC PIC 드롭다운
   - 선택 시 stage records 로컬 필터에 적용 + 드릴다운 URL에 `subcontractor=`, `hdec_pic=` 부착

F. **Data Quality 패널 (페이지 하단, 신규)**
   - `<Card>`에 5~6개 행: 항목 라벨 / count / "View" 버튼
   - View 클릭 → 해당 모듈 raw 페이지로 `?dq=<issue_key>`

## 4. Filter 헬퍼 확장 (`docs-dashboard-filter.ts`)

`DashboardFilterParams`에 다음 추가:
- `subcontractor`, `hdec_pic`, `due_this_week` ('1'), `delay_bucket` ('0-7'|'8-14'|'15-30'|'30+'), `dq` (data quality issue key)

`computeDashboardFilteredIds`에 각 필터 분기 추가:
- subcontractor/hdec_pic — stage record의 해당 필드 매칭
- due_this_week — item에 stage record 중 planned_date가 [오늘, 오늘+7일] 범위 & not done인 것이 하나라도
- delay_bucket — `summariseByItem.max_delay_days`로 버킷 매핑
- dq — `computeDataQualityIssues` 결과에서 issue.ids 사용

`hasAnyDashboardFilter`, `dashboardFilterLabel`도 새 키 반영. Raw Data 페이지는 이미 이 헬퍼를 통해 자동 적용되므로 페이지 코드 수정 불필요.

## 5. UI 가이드

- 모든 라벨 영문, 기존 design system (Card / Button / Tabs / Select / Progress / Badge) 사용
- 색상은 semantic token + 기존 MODULE_ACCENT 유지
- 한국어 텍스트 금지

## 6. 영향 범위 / 비변경

- T&C / Defect 대시보드, Punch 모듈, 기존 ABD/OMM/Warranty 비즈니스 로직(status / cycle 분류) 변경 없음
- 기존 KPI / Stage card / OMM Sub Status card / ABD Bucket grid는 그대로 동작
- Raw 페이지 3종은 `docs-dashboard-filter.ts` 통해 자동으로 새 param 인식

## 작업 단위(파일별)

```
src/lib/docs-stage-records.ts      ← 헬퍼 추가
src/lib/docs-dashboard-filter.ts   ← param/필터 분기 추가
src/lib/docs-executive-dashboard-data.ts ← warrantyRows 노출, select 보강
src/pages/docs/DocsExecutiveDashboardPage.tsx ← Portfolio Strip / 6KPI / Delay Bucket / Subcon·PIC 필터 / Data Quality 패널
```

## 기술 메모

- "Critical Delay" = item.max_delay_days > 30
- "Due This Week" = stage record의 planned_date ∈ [today, today+7], !is_done
- "Completed" = item summary의 `is_completed`(마지막 stage done). ABD는 SSOT 일치를 위해 `computeAbdBucketDistribution`의 approved 카운트와 교차 검증해 차이 시 dev console.warn
- 페이지네이션: 기존 `fetchAll(builder)` 패턴 그대로 사용 (1000행 페이지)
