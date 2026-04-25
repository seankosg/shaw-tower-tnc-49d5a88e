
# Closure 판정 규칙 추가: LL `Status = Closed` 인식 + `Closed On` → Actual Closure Date

LL(원본 엑셀)에서 내려오는 두 개의 신호를 Closure 판정에 정식으로 반영합니다.

1. **`Status` 컬럼 값이 `"Closed"`** → 해당 결함은 마감(Closure = Done)으로 인정
2. **`Closed On` 컬럼의 날짜** → `actual_closure_date`로 저장 (시스템의 실제 마감일로 인식)

## 변경 후 Closure 판정 우선순위

```text
1. actual_closure_date 가 있으면              → "Done"
2. status == "Closed" (대소문자 무시)          → "Done"   ← 신규
3. planned_closure_date < asOf (기한 초과)     → "Delay"
4. completion_status == "Done" 이고
   actual_closure_date 가 없음                → "WIP"
5. 그 외                                       → "Planned"
```

> `Closed On` 날짜가 들어오면 즉시 `actual_closure_date`로 저장되므로, 사실상 1번 규칙으로 흡수됩니다.
> `Closed On`이 비어있고 `Status=Closed`만 있는 경우를 위해 2번 규칙을 추가합니다.

## 변경 사항

### 1. Excel 헤더 매핑 추가 (`src/lib/defect-parser.ts`)
`FIELD_ALIASES`에 다음 별칭 추가:
- `'closed on'` → `actual_closure_date`
- `'closed date'`, `'closure date'`, `'date closed'` → `actual_closure_date` (혹시 모를 변형 대비)

파서 동작 변경:
- `actual_closure_date` 매핑 시 기존 "Actual Closure Date" 컬럼이 비어있고 `Closed On` 컬럼에 값이 있으면 그 값을 사용 (fallback 우선순위: 명시적 actual_closure_date → closed on → null)
- 추가로, `status` 값이 "Closed"인데 `actual_closure_date`가 비어있는 경우 `actual_closure_date`는 그대로 null 유지하되, 아래 status.ts 규칙에서 Done으로 판정되도록 함

### 2. Closure 판정 함수 수정 (`src/lib/defect-status.ts`)
`computeClosureStatus()` 시그니처에 `status` 입력값 추가:

```ts
export interface DefectStatusInputs {
  // 기존 필드들...
  status?: string | null;   // ← 신규
}

export function computeClosureStatus(input, asOf, completionStatus) {
  if (input.actual_closure_date) return 'Done';
  if (String(input.status ?? '').trim().toLowerCase() === 'closed') return 'Done';  // ← 신규
  if (input.planned_closure_date && input.planned_closure_date < asOf) return 'Delay';
  if (completionStatus === 'Done' && !input.actual_closure_date) return 'WIP';
  return 'Planned';
}
```

`computeDefectStatuses()` 호출부도 `status`를 함께 전달하도록 정리.

### 3. 마감 판정 보조 함수 (`src/lib/defect-utils.ts`)
`isClosedDefect()`에 `status === 'Closed'` 조건 추가:

```ts
export function isClosedDefect(item) {
  return Boolean(item.actual_closure_date)
      || String(item.closure_status ?? '') === 'Done'
      || String(item.status ?? '').trim().toLowerCase() === 'closed';   // ← 신규
}
```
지연(overdue) 판정 함수도 동일 조건으로 "마감된 건은 지연 아님" 처리에 반영.

### 4. 호출부 정합성 점검
다음 파일에서 `computeClosureStatus` / `computeDefectStatuses` / `isClosedDefect` 사용처 확인 후 `status` 필드 전달 여부 보정:
- `src/pages/DefectRawDataPage.tsx`
- `src/pages/DefectDashboardPage.tsx`
- `src/pages/DefectDetailPage.tsx`
- `src/pages/DefectQuickUpdatePage.tsx`
- `src/pages/DefectProgressPage.tsx`
- `src/lib/defect-dashboard-utils.ts`
- `src/lib/defect-chart-utils.ts`
- `src/lib/defect-progress-utils.ts`

대부분 이미 `defect_items` 객체 전체를 넘기고 있어 자동으로 `status`가 포함될 것이며, 부족한 곳만 보정합니다.

### 5. 테스트 보강 (`src/test/defect-status.test.ts`)
다음 케이스 추가:
- `Status='Closed'` + `actual_closure_date=null` → Closure 'Done'
- `Status='Closed'` + `Closed On` 날짜 있음 → `actual_closure_date`로 저장됨 + Closure 'Done'
- `Status='Open'` 이고 다른 조건 미충족 → Closure 'Planned' (기존 동작 유지)
- 대소문자/공백 변형 (`closed`, `CLOSED`, ` Closed `) 모두 'Done' 인식

## 영향 범위

- **Import 시**: 새 엑셀이나 재임포트 모두에서 `Closed On`이 자동으로 `Actual Closure Date`로 들어가고, `Status=Closed` 행은 마감 처리됨
- **대시보드/Raw Data**: 기존 마감 건 + LL에서 Closed로 표시된 건이 모두 "Done"으로 집계
- **하위호환**: 기존 데이터 동작은 변경 없음 (추가 규칙만 적용)

## 변경 파일 요약

- `src/lib/defect-parser.ts` — `Closed On` 헤더 매핑 + status 처리
- `src/lib/defect-status.ts` — `computeClosureStatus`에 status="Closed" 규칙 추가
- `src/lib/defect-utils.ts` — `isClosedDefect` 조건 확장
- 호출부 페이지/유틸 — 필요 시 `status` 전달 보정
- `src/test/defect-status.test.ts` — 신규 케이스 4건 추가
