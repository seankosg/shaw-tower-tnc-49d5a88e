## 메모리 저장 — Subcontractor 자동분류 정책 확정

### 배경
사용자가 옵션 A(현 상태 유지)를 선택. V2 분류기는 subcontractor를 내부적으로 식별하되 DB에는 절대 쓰지 않음. 향후 동일 질문에 일관된 답변을 보장하기 위해 프로젝트 메모리에 규칙으로 저장.

### 변경 파일
**`mem://features/business-rules`** — 기존 19줄 끝에 두 개 규칙 추가 (다른 내용 전부 보존):

1. **Defect classifier V2 priority** — 모든 필드에 대해 Excel > DB > V2 룰 결과. V2는 빈 필드만 채우고 절대 덮어쓰지 않음. Import와 Detail 페이지 Auto-classify 버튼 양쪽에 적용.

2. **Subcontractor auto-classification DISABLED** — V2가 내부적으로 subcontractor를 식별(work_type sub_match 조건용)하지만 `defect_items.subcontractor_name` / `subsub_name`에는 절대 쓰지 않음. 엑셀 원본 보존. (사용자 결정 2026-04-29)

파일 frontmatter의 `description`도 "...defect classifier policy"를 추가해 인덱스에서 관련성 매칭이 잘 되도록 갱신.

### 변경 없음
- `mem://index.md` — 기존 참조(Business rules)가 이미 존재하므로 수정 불필요
- 코드 — 현재 구현이 이미 옵션 A와 일치 (Import/Detail 모두 `result.subcontractor`를 무시)

### 검증
저장 후 `code--view mem://features/business-rules`로 두 규칙이 추가됐는지 확인하고 마무리.
