## 분석

업로드 파일 `SHAW_Punch_20260526_1823.xlsx`의 헤더 44개를 현재 `PUNCH_FIELDS` 레지스트리의 alias 인덱스에 대조한 결과, **3개 헤더만이 매핑 실패**합니다 (나머지는 정상 매핑).

| Excel 헤더 | 정규화 | 현재 매칭 | 대상 필드 | 문제 |
|---|---|---|---|---|
| **Main Cat** | `maincat` | ❌ 없음 | `category1` | alias에 `maincategory`만 있고 `maincat` 없음 |
| **Sub Cat** | `subcat` | ❌ 없음 | `category2` | alias에 `subcategory`만 있고 `subcat` 없음 |
| **Actual %** | `actual` | ❌ 없음 | `actual_progress_pct` | alias에 `actualpct`만 있고 `actual` 없음 (현재 importable 컬럼) |

그 외 가능성 있는 문제 검토 결과:
- "Planned %" / "Variance %" / "Health" / "Pre-Eng Ready" / "Pre-Eng Blockers" / "Is Summary" / "Manual Override Fields" / "row_type" → 모두 `readOnly` 또는 매칭됨 → 무해
- "0.0%" 같은 백분율 문자열 → `coerceNumber`가 이미 `%` 제거 처리 → 무해
- "Subtask No"="S" (Summary marker) → 기존 파서 로직(`isSummaryMarker`)이 이미 처리 → 무해
- 헤더가 8행에 위치(상단 7행은 메타데이터) → `parsePunchWorkbook`이 첫 20행을 스캔해 best-match 헤더 자동 감지 → 무해
- "Parent Item No" → `parentitemno` alias로 정상 매칭
- 모든 날짜·gate·team 값 → 기존 coercer 처리 가능

## 수정 사항

**`src/lib/punch-field-registry.ts`** — 누락된 alias 3개 추가:

```ts
// line 119 (category1)
aliases: ['category1', 'cat1', 'maincategory', 'maincat'],

// line 120 (category2)
aliases: ['category2', 'cat2', 'subcategory', 'subcat'],

// line 142 (actual_progress_pct)
aliases: ['actualpct', 'actual', 'actualprogress', 'actualprogresspct', 'progress'],
```

## 변경하지 않는 것

- `parsePunchWorkbook` 자체 로직 변경 없음 (자동 헤더 감지·readOnly skip·summary marker 처리 모두 이미 동작)
- DB 스키마, 마이그레이션 없음
- Admin Header Mappings(DB) 변경 없음 — 코드 alias만 보강
- 다른 모듈(Defect/Docs) 영향 없음

## 검증

빌드 후 동일 파일을 Punch Import 페이지에서 시험 업로드하여 Column Select 다이얼로그에서 Main Cat / Sub Cat / Actual % 3개 헤더가 각각 Category 1 / Category 2 / Actual % 필드에 자동 매칭되는지 확인합니다.
