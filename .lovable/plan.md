## 변경 범위
ABD 섹션의 Stage Progress 탭만 팀 → 트레이드 기준으로 교체합니다. OMM, Warranty는 현재의 팀 탭을 유지합니다.

## 수정 파일

### 1) `src/pages/docs/DocsExecutiveDashboardPage.tsx`
`ModuleSection` 컴포넌트에 모듈별 분기 추가:

- ABD인 경우:
  - `@/lib/docs-trade`의 `resolveTrade({ trade, sheet_name })`로 각 record의 트레이드 도출
    - ABD record는 `sheet_name` 필드가 없으므로 `document_no`를 폴백으로 사용 (`resolveTrade({ trade: r.trade, sheet_name: r.document_no })`)
  - 탭 목록은 실제 데이터에 등장하는 트레이드만 `TRADE_OPTIONS` 순서로 노출
  - `teamRecords` 대신 트레이드 필터된 `tradeRecords`로 stage 계산
  - StageCard 클릭 시 URL 파라미터 `team` 대신 `trade=<TradeCategory>` 전달
  - 라벨: All / Arch / Struct / Mech / Elec / Plumb / Fire / HVAC / Civil / Land / Int / Other (짧은 표기)
  - `TabsList`는 모바일 대응 위해 `flex-wrap`
- OMM, Warranty: 현재 팀 탭 로직 그대로 유지

`DocsStageRecord` 타입에 `trade` 정보가 없으면 ABD record 빌드 시 trade를 함께 채워주는 보조가 필요. 가장 단순한 방법은 dashboard에서 다시 raw rows를 매핑하는 대신, `docs-stage-records.ts`에서 ABD 빌드 시 `trade`/`document_no`를 record에 보존하는 것 → 현재 record에 이미 `team`이 있으므로 `trade` 필드(또는 도출용 raw 필드) 추가가 필요한지 파일 확인 후 결정. 없다면 `buildAbdStageRecords`에서 `trade`(raw값) 및 `document_no`를 record에 포함하도록 가벼운 확장.

### 2) `src/lib/docs-stage-records.ts` (필요 시)
`DocsStageRecord` 인터페이스에 ABD용 옵션 필드 `trade?: string | null`, `document_no?: string | null` 추가하고, `buildAbdStageRecords`에서 채워줌. OMM/Warranty는 그대로.

### 3) `src/lib/docs-dashboard-filter.ts`
`DashboardFilterParams`에 `trade?: string | null` 추가, `readDashboardFilterParams`/`hasAnyDashboardFilter`/라벨 처리 확장. ABD 모듈에 한해 `resolveTrade`로 매칭 필터 적용.

### 4) `src/pages/docs/DocsRawDataPage.tsx`
대시보드 파라미터 처리 목록(`team`, `stage`, `status`, `overdue`)에 `trade` 추가하여 초기 필터로 적용 및 URL strip 로직 포함.

## 범위 외
- 데이터베이스 변경 없음
- OMM / Warranty 섹션 변경 없음
- Module Summary 카드(Total/Done/Overdue) 변경 없음 — 현재대로 모듈 전체 기준 유지
- Raw Data 페이지의 trade 컬럼 자체 필터 UI 변경 없음 (대시보드에서 넘긴 trade 파라미터를 초기값으로만 사용)
