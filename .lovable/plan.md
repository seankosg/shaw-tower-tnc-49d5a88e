## Tooltip 잘림 문제 수정 — 전역 (모든 모듈 자동 적용)

### 문제

도넛/Cycle/Progress 위에 마우스를 올렸을 때 나오는 툴팁이 테이블 행 높이만큼만 보이고 나머지는 잘림.

영향받는 화면:
- T&C Raw Data (`/tc/raw-data`)
- Defect Raw Data (`/defects/raw-data`)
- Docs ABD Raw Data (`/docs/raw-data`)
- Docs OMM Raw Data (`/docs/omm`)
- 기타 모든 shadcn `Tooltip` 사용처

### 원인

`src/components/ui/tooltip.tsx` (shadcn 기본)이 `TooltipPrimitive.Portal` 없이 inline 렌더되고 있어, 부모 테이블 컨테이너의 `overflow: hidden`/`overflow: auto` 안에 갇혀 잘림.

### 수정 (단 1개 파일)

**`src/components/ui/tooltip.tsx`** — `TooltipContent`를:
1. `<TooltipPrimitive.Portal>`로 감싸기 → body 직속으로 렌더되어 어떤 overflow 컨테이너에도 잘리지 않음
2. `z-50` → `z-[9999]`로 상향 (Dialog/Sheet 위에서도 항상 최상단)
3. `collisionPadding={8}` 추가 → viewport 가장자리 자동 회피

### 영향 범위

이 한 파일이 모든 `Tooltip` 사용처의 공용 컴포넌트이므로 자동으로 전역 적용:
- T&C / Defect / ABD / OMM Raw Data 페이지의 모든 도넛·Cycle·Progress 툴팁
- 사이드바, 버튼, 헤더 등 모든 hover 툴팁
- 향후 Warranty/Spare Part 모듈도 자동 포함

기존 사용처들은 portal 가정으로 만들어졌으므로 동작 변경 없음 (잘리던 케이스만 정상화).

### Out of Scope

- 개별 페이지/컴포넌트 수정 없음 (공용 컴포넌트 한 곳만)
- HTML native `title=""` 속성은 브라우저 제어라 영향 없음
