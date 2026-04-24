

## Q5 답변 + 최종 확정 plan

### Q5에 대한 결론

```text
사용자 의견: Import 시 자동분류는 항상 일괄 적용되므로,
기존 DB에 있는 row의 분류값은 이미 "그 시점의 규칙"으로
채워졌다고 보는 것이 맞다.

→ 옵션 1 채택: 기존 row는 그대로 둔다 (work_type=null 허용).

근거:
- 새 컬럼(work_type / classification_source / classified_at)은
  아직 존재하지 않았으므로 기존 row는 자연스럽게 null.
- 기존 main_trade / sub_trade는 과거 import 시점의 값이므로
  덮어쓰면 "그 시점의 분류 이력"이 손실됨.
- 다음 번 해당 row가 다시 import되면 신규 규칙으로 채워짐.
- 그 사이 개별 보정이 필요하면 Detail 페이지의
  "Auto-classify from description" 버튼으로 1건씩 처리 가능.
- 전체 일괄 재분류는 후속 작업(E1)으로 분리.
```

### 최종 확정 결정 사항

```text
A1. 키워드 우선순위 = priority asc + keyword 길이 desc
B1. Excel main/sub_trade 채워져 있으면 보존, work_type만 자동
Q1. Field Discipline 매칭 = 부분일치(양방향 substring)
Q2. Field Discipline 저장 위치 = trade_detail 컬럼 그대로
Q3. discipline fallback work_type = discipline별 의미 있는 값
Q4. Import 결과 카드에 Unclassified/Rule/Discipline 별도 카운트
Q5. 기존 row는 work_type=null 그대로 유지
D1. Admin Rules + Discipline Fallback CRUD UI 본 plan 포함
E1. 전체 일괄 재분류 기능은 후속 (본 plan 제외)
```

### 1. DB 스키마 변경 (migration)

```text
[ALTER] defect_items
  + work_type                text   nullable
  + classification_source    text   nullable  -- 'rule'|'discipline'|'manual'|'unclassified'
  + classified_at            timestamptz nullable

[NEW] defect_classification_rules
  id, keyword(unique, lowercase), main_trade, sub_trade,
  work_type, priority(default 100), is_active, timestamps
  RLS: SELECT=authenticated / CUD=admin·superuser

[NEW] defect_discipline_fallback
  id, field_discipline(unique, lowercase),
  main_trade, sub_trade, work_type, is_active, timestamps
  RLS: 동일

[INDEX]
  defect_items(work_type), (classification_source)
  defect_classification_rules(is_active, priority)
  defect_discipline_fallback(is_active, field_discipline)
```

### 2. Seed 데이터 (insert tool)

```text
defect_classification_rules (12)
  paint, stain, skirting, grill, uneven, tonality,
  leak, water, door, label, db, fcu  → VBA 매핑 그대로

defect_discipline_fallback (6)
  mechanical    → ACMV            / General / Mechanical Rectification
  electrical    → Electrical      / General / Electrical Rectification
  plumbing      → Plumbing        / General / Plumbing Rectification
  architectural → Architectural   / General / Finishing Rectification
  civil         → Civil           / General / Civil Rectification
  fire          → Fire Protection / General / Fire Rectification

defect_field_config
  work_type 행 추가 (sort_order=140, display_name='Work Type')
```

### 3. 분류 로직 (`src/lib/defect-classifier.ts` 신규)

```text
classifyDefect({ description, field_discipline }, rules, fallbacks)

순서:
  1. description lowercase
  2. rules 정렬: priority asc, keyword.length desc
  3. 첫 InStr 매칭 → source='rule'
  4. miss & field_discipline 존재:
       fallback 부분일치 양방향:
         input.includes(fb.field_discipline)
         OR fb.field_discipline.includes(input)
       다중 매칭 시: field_discipline 길이 desc, created_at asc
       → source='discipline'
  5. 모두 실패 → Unclassified / Unclassified / Review Required
                  source='unclassified'
```

### 4. Import 통합 (`DefectImportPage.tsx`)

```text
A. Import 시작 시 1회: rules + fallbacks 동시 로딩

B. 각 row:
   const c = classifyDefect(
     { description: row.description,
       field_discipline: row.trade_detail }, rules, fallbacks);
   if (!row.main_trade) row.main_trade = c.main_trade;
   if (!row.sub_trade)  row.sub_trade  = c.sub_trade;
   row.work_type = c.work_type;
   row.classification_source = c.source;
   row.classified_at = now();

C. defect_change_log:
   변경 시 change_source='import_auto_classify'

D. defect_upload_row_logs:
   source='unclassified' → reason_code='unclassified_defect' (warning)
   source='discipline'   → reason_code='discipline_fallback'  (info)

E. Import 결과 카드 카운트 추가:
   Inserted / Updated / Skipped / Rejected
   + Auto-classified (rule)
   + Auto-classified (discipline)
   + Unclassified
   각 카운트 클릭 → RawData로 이동 (classification_source 필터)
```

### 5. UI 변경

```text
DefectDetailPage
  - Main Trade / Sub Trade / Work Type / classification_source 표시
  - "Auto-classify from description" 버튼 (단건 재계산)
  - 직접 수정 저장 시 source='manual'

DefectQuickUpdatePage
  - work_type 편집 가능

DefectRawDataPage
  - 컬럼/필터에 work_type, classification_source 추가

DefectExportPage
  - work_type / classification_source 필터·엑셀 컬럼

DefectDashboardPage + DefectProgressMatrix
  - Group By 옵션 'Work Type' 추가
```

### 6. Admin UI

```text
AdminPage 신규 탭 "Classification" (admin·superuser only)
  - Keyword Rules CRUD
      keyword/main/sub/work_type/priority/is_active
  - Discipline Fallback CRUD
      field_discipline/main/sub/work_type/is_active
```

### 7. 영향 받는 파일

```text
[migration]
supabase/migrations/<new>_defect_classification.sql

[seed - insert tool]
defect_classification_rules : 12 rows
defect_discipline_fallback  : 6 rows
defect_field_config         : work_type 1 row

[lib]
src/lib/defect-classifier.ts                    (신규)
src/lib/defect-utils.ts                         (DefectItem 3 필드)
src/lib/defect-export-utils.ts
src/lib/defect-dashboard-utils.ts
src/lib/defect-dashboard-excel-export.ts

[parser]
src/lib/defect-parser.ts
  + 'work type' alias, ParsedDefectRow.work_type

[pages / components]
src/pages/DefectImportPage.tsx
src/pages/DefectDetailPage.tsx
src/pages/DefectQuickUpdatePage.tsx
src/pages/DefectRawDataPage.tsx
src/pages/DefectExportPage.tsx
src/pages/DefectDashboardPage.tsx
src/pages/AdminPage.tsx                         (Classification 탭)
src/components/defects/DefectProgressMatrix.tsx
src/hooks/useDefectFieldConfig.ts

[test]
src/test/defect-classifier.test.ts
  - rule 매칭 / 우선순위(priority + 길이)
  - discipline 양방향 부분일치
  - unclassified
  - 빈 description / 빈 discipline
  - Excel main/sub_trade 보존 시나리오
```

### 8. 검증 항목

```text
1. work_type / classification_source / classified_at 컬럼 생성
2. rules 12 / fallbacks 6 / field_config 1 seed
3. RLS: 일반 user SELECT만, admin만 CUD
4. 'paint touch up' → rule
5. 'water leak in ceiling' → priority+길이 우선순위로 매칭
6. description 빈 값 + Field Discipline='Mech'
   → 'mechanical' fallback (부분일치) → ACMV/General/Mechanical Rectification
7. description·discipline 모두 빈 값 → Unclassified + warning log
8. Excel main_trade 채워진 row → 그 값 유지, work_type만 자동
9. Detail Auto-classify 버튼 동작
10. 직접 수정 저장 → source='manual'
11. RawData / Export / Dashboard 신규 필드 노출
12. Import 결과 카드 카운트 4종(rule/discipline/unclassified 포함)
13. 기존 DB row의 work_type은 null 유지 (마이그레이션 시 미변경)
14. Admin Classification 탭 rules/fallbacks CRUD 동작
15. defect_change_log 'import_auto_classify' 기록
16. build + tests pass
```

