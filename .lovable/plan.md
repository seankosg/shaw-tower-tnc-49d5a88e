# Defect / Warranty / As-Built import 별칭 정리

OMM 모듈에서 적용한 동일한 패턴을 Defect, Warranty, As-Built 3개 모듈에도 일괄 적용하여, Admin Header Mappings UI에서 모든 별칭을 관리할 수 있도록 하고 파서의 FALLBACK 별칭을 보강합니다.

## 목표

1. Admin Header Mappings 탭에서 각 모듈 헤더가 unmapped로 남지 않고, 사용자가 별칭을 자유롭게 매핑 가능
2. 파서 FALLBACK_ALIASES가 자주 등장하는 헤더 변형(snake_case, Korean 라벨, 줄임말, ordinal 변형)을 충분히 흡수
3. 의도적으로 무시할 컬럼은 `skip` pseudo-target으로 명시 가능

## 변경 범위

### 1. Admin UI 필드 목록에 `skip` pseudo-target 추가
**파일:** `src/pages/admin/HeaderMappingsTab.tsx`
- `DEFECT_FIELDS` 마지막에 `'skip'` 추가
- `DOCS_AS_BUILT_FIELDS` 마지막에 `'skip'` 추가
- `DOCS_WARRANTY_FIELDS` 마지막에 `'skip'` 추가

OMM과 동일하게 Admin에서 import 시 무시할 컬럼을 지정 가능.

### 2. Defect 파서 FALLBACK_ALIASES 보강
**파일:** `src/lib/defect-parser.ts` (`FIELD_ALIASES`)
- snake_case 변형: `issue_no`, `issue_type`, `area_raw`, `area_level`, `area_location`, `subcontractor_name`, `subsub_name`, `planned_start_date` 등 — `toFieldName`이 `_/-`를 공백으로 정규화하므로 일부는 자동 매칭되나, 누락된 형태 점검
- Korean 라벨: `'호기'`, `'구역'`, `'세부공종'`, `'우선순위'`, `'상태'`, `'비고'`, `'시작일'`, `'완료일'`, `'마감일'` 등 흔히 쓰이는 라벨
- 줄임말 / 변형: `'iss no'`, `'iss type'`, `'sc'`(subcontractor), `'sub-sub name'`, `'comp date'`, `'closure'`, `'plan start'`, `'plan complete'`
- 컬럼 무시 후보: `'no'`, `'no.'`, `'s.no'`, `'index'` → `'skip'`

### 3. As-Built (Docs) 파서 FALLBACK_ALIASES 보강
**파일:** `src/lib/docs-import-parser.ts` (`FIELD_ALIASES`, `SUB_ALIAS`)
- 도면 변형: `'drawing number'`, `'dwg #'`, `'dwg'`, `'file no'`, `'sheet no'`
- 단계 라벨 변형: `'1st planned'`, `'1st actual'`, `'1st response'` (현재는 정규식으로 일부 처리되나 단독 라벨도 보강)
- Korean: `'도면번호'`, `'도면명'`, `'개정'`, `'담당'`, `'비고'`
- Skip 추가: `'sl no'`, `'index'`, `'#'`

### 4. Warranty 파서 FALLBACK_ALIASES 보강
**파일:** `src/lib/docs-warranty-import-parser.ts` (`FALLBACK_ALIASES`)
- snake_case / 변형: `'item_no'`, `'warranted_item'`, `'warranty period (years)'`, `'warranty years'`
- 단계 라벨 변형: `'draft planned submission'`, `'draft actual submission'`, `'draft planned response'`, `'draft actual response'`, `'draft status'`, `'subcontractor signing planned'`, `'subcontractor signing actual'`, `'hdec signing planned'`, `'hdec signing actual'`, `'final planned'`, `'final actual'`
- Korean: `'품목'`, `'카테고리'`, `'팀'`, `'담당자'`, `'엔지니어'`, `'비고'`
- Skip: `'no'`(이미 있음), `'#'`, `'index'`

## 기술 메모

- 모든 별칭은 lowercase 키로 등록 (정규화 함수 결과와 일치).
- Defect 파서의 `toFieldName`은 `_/-`를 공백으로 변환 후 lookup → snake_case 헤더는 자동으로 공백형 키와 매칭됨. 별칭은 공백형으로 추가.
- Warranty 파서는 `lower` (lowercase)와 `norm` (case 보존) 두 단계로 DB lookup → FALLBACK은 lowercase 키만 정의.
- Korean 라벨은 정규화 함수가 한글을 보존하므로 한글 키 그대로 등록 가능.
- `skip` pseudo-target은 파서 측에서 이미 처리됨 (Warranty/OMM에 구현 존재). Defect 파서에는 `'skip'` 분기가 없으므로 `toFieldName` 호출부에서 skip 체크 추가 필요.

## 검증 방법

1. Admin → Header Mappings → 각 모듈 탭에서 unmapped 그룹이 비거나 의미 있는 미매핑만 남는지 확인
2. 샘플 raw 파일을 import 했을 때 신규 별칭이 정상 매핑되는지 콘솔 로그(`import-field-log`)로 확인
3. `skip` 지정한 컬럼이 raw_payload/audit에서 제외되는지 확인
