# Defect Header Mapping에 `Captured By` 노출

## 문제
Admin → Header Mapping의 Defect 모듈 타겟 필드 목록에 `captured_by_name`(Captured By)이 보이지 않음. 따라서 사용자가 alias를 등록할 수 없음.

## 원인
`src/pages/admin/HeaderMappingsTab.tsx`의 `DEFECT_FIELDS` 화이트리스트에 `captured_by_name`이 누락. 파서(`defect-parser.ts`)와 Field Config 라벨에는 이미 존재하지만, Header Mapping UI는 별도 whitelist로 타겟을 거른다.

동일하게 신규 추가된 `hdec_verification`, `hdec_reason`도 누락되어 있어 같이 추가 필요(메모리 규칙: 신규 필드는 Field Config와 Header Mapping에 모두 추가).

## 변경
1. `src/pages/admin/HeaderMappingsTab.tsx` — `DEFECT_FIELDS`에 다음 3개 추가:
   - `captured_by_name`
   - `hdec_verification`
   - `hdec_reason`
2. `src/components/import/DefectColumnSelect.tsx` — `DEFECT_KNOWN_FIELDS`에 `captured_by_name` 추가(Column Select 다이얼로그에서 알 수 없는 필드로 표시되지 않도록).

## 비고
- DB 스키마/RLS 변경 없음. 기존 import_header_mappings 행은 그대로.
- 파서 하드코딩 alias(`captured by`, `captured_by`, `capturedby`)는 그대로 유지되며, 이제 DB에서도 추가 alias 등록 가능.
