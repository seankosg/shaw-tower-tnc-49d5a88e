## 원인

`src/lib/ppt-builder.ts`의 `loadKPIs(rd)`가 `rd.tnc!`, `rd.defect!`, `rd.docs!`, `rd.punch!`를 **무조건** non-null로 단언하고 `.totals`에 바로 접근합니다.

```ts
const tnc = rd.tnc!;
const tncKPI: TncKPI = { total: tnc.totals.total, ... };
```

`buildReport()`는 선택된 모듈만 채우므로(`if (opts.modules.includes('tnc')) data.tnc = ...`), 사용자가 일부 모듈을 해제하거나 `slideConfig`로 일부 슬라이드만 켜고 다운로드하면 해당 키가 `undefined`가 되어 `Cannot read properties of undefined (reading 'totals')` 가 발생합니다.

또한 `buildPpt`의 슬라이드 러너는 `slideConfig`로 비활성화된 슬라이드는 건너뛰지만, `loadKPIs`는 그 전에 호출돼 모든 모듈을 강제로 읽기 때문에 실제로 활성화된 슬라이드가 무엇이든 무조건 터집니다.

## 변경 사항 (UI 변경 없음)

### 1) `src/lib/ppt-builder.ts` — `loadKPIs` 모듈별 가드

- 반환 타입을 `{ tncKPI?: TncKPI; defectKPI?: DefectKPI; docsKPI?: DocsKPI; punchKPI?: PunchKPI }` 로 변경.
- `rd.tnc`가 있을 때만 `tncKPI` 구성. defect/docs/punch도 동일.
- `tnc.totals`, `tnc.currentActual` 등 내부도 옵셔널 체이닝(`??`)으로 안전화.

### 2) `src/lib/ppt-builder.ts` — `buildPpt`/`buildAndDownloadPpt` 슬라이드 러너 가드

- `runners` 안에서 해당 KPI가 없으면 슬라이드를 그리지 않고 조용히 스킵.
  - 예: `tnc_snapshot: () => { if (tncKPI) buildSnapshot(pres, tncKPI); }`
- `dashboard`는 부분 데이터로도 그리도록 KPI 인자를 옵셔널로 받게 처리(없는 카드는 "—" 또는 0으로 표시). 변경 최소화를 위해 우선 "4개 모두 있을 때만" 렌더하고, 없으면 스킵.
- `buildAndDownloadPpt`도 동일하게 각 `build*` 호출 앞에 존재 가드 추가.

### 3) 회귀 방지

- 모듈 4개 모두 선택된 기존 기본 흐름은 동작이 동일하도록 유지(기본값 `['tnc','defect','docs','punch']`).
- TypeScript 빌드 통과를 위해 `build*` 함수 시그니처는 변경하지 않고, 호출 측에서만 가드.

## 검증

- 모듈 4개 모두 선택 → PPT 다운로드 정상.
- 모듈 일부만 선택(예: T&C만) → 해당 모듈 슬라이드만 포함되어 PPT 다운로드 성공, 콘솔 에러 없음.
- 변경 후 `Download PPT` 다이얼로그에서 "Cannot read properties of undefined (reading 'totals')" 토스트 더 이상 발생 안 함.

## 영향 파일

- `src/lib/ppt-builder.ts` (단일 파일 수정)
