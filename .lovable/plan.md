## 문제

`Defect Raw Data` 표에 Progress 컬럼이 노출되지 않습니다(Legend는 헤더에 보이지만 실제 컬럼이 안 보임).

## 원인

`src/pages/DefectRawDataPage.tsx`의 `columnOrder` (864-868행)는 `__select`, `issue_no`만 앞에 핀(pin)하고 나머지는 `sortFieldNames(remaining)`로 정렬합니다.

`sortFieldNames`는 `field_config.sort_order`를 기준으로 정렬하는데, `stage_progress`는 가상 컬럼이라 DB의 `defect_field_config`에 없으므로 `getOrder` 폴백 값인 **9999**가 적용됩니다 → 컬럼이 표의 **맨 끝**으로 밀려서 화면에 안 보입니다.

T&C 쪽 `SubtestList.tsx`는 같은 문제를 `PINNED_FRONT = ['__select', 'item_no', 'stage_progress']`로 해결하고 있습니다.

## 수정 (단일 파일, 한 줄 변경)

`src/pages/DefectRawDataPage.tsx` 864-868행의 `columnOrder`에 `stage_progress`를 명시적으로 핀(pin)하고 `remaining`에서 제외합니다.

```ts
const columnOrder = useMemo(() => {
  const PINNED_FRONT = ['__select', 'issue_no', 'stage_progress'];
  const remaining = (DEFECT_RAW_FIELDS as string[]).filter(
    (id) => !PINNED_FRONT.includes(id)
  );
  return [...PINNED_FRONT, ...sortFieldNames(remaining)];
}, [sortFieldNames]);
```

이렇게 하면 Progress 컬럼이 `Issue No` 바로 뒤(고정 영역 또는 그 직후)에 항상 표시됩니다 — T&C와 동일한 위치/동작.

## 비고

- 컬럼 가시성(`columnVisibility`)은 이미 858행에서 `stage_progress`를 강제 visible로 처리 중이라 추가 작업 없음.
- 사용자별 `localStorage` 저장값에는 `columnOrder`가 포함되지 않으므로(497-580행 확인) 캐시 무효화 불필요.
- 대시보드 필터 유지 동작은 영향 없음.
