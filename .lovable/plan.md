## 변경 계획 — Defect Import에 "Cat Check" preset 추가

`src/components/import/DefectColumnSelect.tsx` 의 `presets` 배열에 4번째 프리셋 **`Cat Check`** 추가. Category 분류(LL/HDEC) 판별에 필요한 컬럼만 자동 선택되도록 합니다.

### Cat Check 필수 컬럼 세트

행 매칭/식별 키:
- `issue_no` (header 감지·매칭 필수)

분류 판단 근거(설명문):
- `description` — `Description`, `Issue Description` 헤더 모두 동일 필드(`description`)로 매핑됨 (defect-parser.ts 93–94 확인)

Category 판별 핵심:
- `priority` — LL's Category
- `hdec_verification` — HDEC's Category
- `hdec_reason` — HDEC Cat B 분쟁 사유

Outstanding 여부 판별(= Closure ≠ Done):
- `closure_status`
- `actual_closure_date`

(팀/책임자 필드는 제외)

### 코드 변경

`presets` useMemo 내부에 추가:

```ts
const CAT_CHECK_FIELDS = new Set([
  'issue_no',
  'description',
  'priority',
  'hdec_verification',
  'hdec_reason',
  'closure_status',
  'actual_closure_date',
]);
const catCheckHeaders = headers.filter((h) => CAT_CHECK_FIELDS.has(toFieldName(h)));
```

`presets` 배열 마지막에 추가:

```ts
{
  id: 'cat-check',
  label: 'Cat Check',
  matchedHeaders: catCheckHeaders,
  className: 'border-rose-300 text-rose-900 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-100 dark:hover:bg-rose-950',
},
```

### 동작
- `Cat Check` 클릭 → 위 7개 필드에 매칭되는 헤더만 선택, 나머지 자동 제외
- `Description` 과 `Issue Description` 헤더가 둘 다 존재해도 모두 동일 필드로 매핑되어 함께 포함됨
- 기존 3개 preset 옆 4번째 위치, rose 톤으로 시각 구분(검증·이견 점검 성격)

### 영향 범위
- 변경 파일: `src/components/import/DefectColumnSelect.tsx` 단일
- 로직/스키마 변경 없음 — 순수 UI preset 추가
