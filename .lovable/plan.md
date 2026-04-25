# Raw Data 필터 상태 유지 (T&C / Defect)

## 목적

사용자가 Raw Data 페이지(T&C: `/tc/raw-data`, Defect: `/defects/raw-data`)에서 컬럼 필터/검색/정렬을 적용한 뒤 행을 클릭해 상세 페이지로 들어가고, 상세 페이지의 **Back** 버튼이나 브라우저 뒤로 가기로 돌아왔을 때 **직전에 적용해 두었던 모든 필터·검색·정렬·스크롤 위치가 그대로 복원**되도록 합니다.

## 현재 동작과 문제점

두 페이지(`SubtestList.tsx`, `DefectRawDataPage.tsx`) 모두 이미 `localStorage`에 `sorting / columnFilters / globalFilter / columnSizing` 을 저장하고, 마운트 시 복원하는 로직이 있습니다. 하지만 다음과 같은 시나리오에서 필터가 사라지는 문제가 있습니다.

1. **Dashboard 등에서 URL 매개변수로 진입 후 추가 필터 적용 → 상세 → Back**
   - 진입 URL 예: `/defects/raw-data?team=ME`
   - 사용자가 추가로 `subcontractor=ABC` 같은 컬럼 필터를 손으로 적용
   - 행 클릭 → 상세 → Back 으로 복귀하면 URL은 `?team=ME` 만 복원되고, 복원 로직이 `hasUrlFilters=true`로 판단해 **localStorage에 저장된 사용자 추가 컬럼 필터를 모두 버립니다.**
2. **행 클릭 시 query string 미보존**
   - `navigate('/defects/{id}')` / `navigate('/subtests/{id}')` 가 query string을 가져가지 않아, 상세 페이지에서 명시적으로 “목록으로 돌아가기”를 눌러도 원래 URL을 복원하지 못합니다.
3. **마운트 직후 빈 상태로 한 번 렌더되는 타이밍 이슈**
   - `setStateLoaded(false)` → 복원 → `setStateLoaded(true)` 사이에 빈 `columnFilters`로 한 프레임 그려진 뒤 자동 저장 effect가 트리거되어, 일부 환경에서 빈 상태가 저장되는 경합이 발생할 수 있습니다.

## 변경 계획

### 1. URL 매개변수 + 사용자 컬럼 필터를 “병합 복원”하도록 수정

`DefectRawDataPage.tsx`, `SubtestList.tsx` 의 마운트 복원 effect를 다음과 같이 변경합니다.

- `hasUrlFilters` 가 true 라도 **localStorage에 저장된 컬럼 필터 중 URL이 덮어쓰는 컬럼만 제외**하고 나머지는 보존합니다. (현재 로직: 전체를 버림 → 변경: URL이 다루는 컬럼 id만 제외)
- `globalFilter` 도 마찬가지로 URL `q` 가 없으면 localStorage 값을 사용하도록 통일합니다.
- 정렬과 컬럼 사이즈는 현재대로 localStorage에서 복원합니다.

### 2. 행 클릭 시 query string 보존

- `DefectRawDataPage`: `navigate('/defects/${id}')` → `` navigate(`/defects/${id}${location.search}`) `` 로 변경하고 `useLocation` 추가 import.
- `SubtestList`: 동일하게 `` navigate(`/subtests/${id}${location.search}`) `` 로 변경.
- 이렇게 하면 상세 페이지의 Back(=`navigate(-1)`) 시 URL search 가 자연스럽게 복원되어, 그 위에 localStorage 복원이 얹어지면서 사용자 적용 필터가 100% 살아납니다.

### 3. 자동 저장 effect의 경합 방지

- 자동 저장 effect의 `if (!stateLoaded) return;` 가드는 이미 있으나, 안전하게 `columnFilters` 등을 “복원이 끝난 후” 한 번이라도 사용자가 변경한 경우에만 저장하도록 `hasUserInteractedRef` 같은 ref 가드를 추가하거나, 단순히 디바운스 시간을 200ms로 줄이고 첫 저장에서 빈 상태가 직전 저장값을 덮어쓰지 못하도록 “현재 복원된 값과 동일하면 skip” 로직을 추가합니다.
- 두 페이지 모두 동일한 패턴으로 적용.

### 4. 스크롤 위치 복원 강화

- 현재도 `${storageKey}:scroll` 로 저장/복원 하지만, 데이터 로드(`loading=true` → `false`) 직후에 한 번 더 적용해야 가상 스크롤(virtualizer)이 행을 그린 뒤 정확한 위치로 스냅됩니다.
- `useEffect` 에 `loading` 을 의존성으로 추가하여 데이터가 모두 그려진 시점에 한 번 더 `scrollTop / scrollLeft` 를 세팅합니다.

### 5. 상세 페이지 Back 동작 통일

- `DefectDetailPage` Back 버튼: 현재 `navigate(-1)` 유지 (history 기반 복원이 가장 자연스러움).
- `SubtestDetail` Back 버튼: 현재 `navigate(-1)` 유지. 단, 새 탭 등에서 history가 비어있을 때를 대비해 fallback으로 각각 `/defects/raw-data`, `/tc/raw-data` 로 이동하도록 보정합니다 (`if (window.history.length > 1) navigate(-1); else navigate('/...raw-data')`).

## 변경 파일

- `src/pages/DefectRawDataPage.tsx` — 복원 로직 병합, 행 클릭 navigate에 `location.search` 부착, 스크롤 복원 보강.
- `src/pages/SubtestList.tsx` — 동일 변경.
- `src/pages/DefectDetailPage.tsx` — Back 버튼 history 길이 fallback.
- `src/pages/SubtestDetail.tsx` — Back 버튼 history 길이 fallback.

## 동작 검증 시나리오 (수동)

1. `/defects/raw-data` 진입 → 컬럼 필터 + 텍스트 검색 + 정렬 적용 → 행 클릭 → 상세 → Back → 동일 상태 복원 확인.
2. `/defects/raw-data?team=ME` 로 dashboard에서 진입 → 추가 컬럼 필터 적용 → 상세 → Back → URL 의 team 필터와 사용자 추가 필터 모두 유지 확인.
3. `/tc/raw-data` 도 동일 시나리오 검증.
4. 새 탭에서 상세를 직접 열고 Back 누름 → fallback 으로 raw data 페이지로 이동.
5. 스크롤을 아래로 한 뒤 상세 → Back → 같은 스크롤 위치로 복귀.
