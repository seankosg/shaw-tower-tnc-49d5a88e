## Goal
Critical Issue Board 상단의 **"Open in Raw Data"** 버튼을 완전히 제거.

## Changes

### `src/components/dashboard/CriticalItemsPanel.tsx`
- 헤더 우측의 `<Button>Open in Raw Data</Button>` 제거.
- 더 이상 사용되지 않는 `goRaw()` 헬퍼 중 **상단 버튼용 호출**만 제거. 그룹 헤더 행 클릭(`goRaw({ team: ... })`)은 유지 (그룹별 drill-down은 유용).
- 사용하지 않게 된 `Button` import는 그대로 유지 (다른 곳에서 미사용이면 제거 가능 — 현재는 buttonless이므로 import 정리).
- `rawDataHref` prop은 그룹 클릭에서 여전히 사용되므로 유지.

## Out of scope
- 그룹 헤더 클릭 → Raw Data 이동은 유지.
- 행 클릭 → 상세 페이지 이동은 유지.
