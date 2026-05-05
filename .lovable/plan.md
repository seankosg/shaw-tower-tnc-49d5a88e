## OMM Import — 헤더 자동 인식 강화

### 문제

SHAW OMM 양식의 실제 헤더가 fallback에 등록된 토큰과 달라 unmapped 처리됨:
- `D.Submission Planned Date` (점 뒤 공백 없음) → `d.submission planned date`
- `F.Submission Planned Date` → `f.submission planned date`
- 기타: `D. Response Date`, `F. Actual Respond Date`, `Traning Required` 등

현재 `FALLBACK_ALIASES`에는 `draft planned date` / `final planned date`만 있음.

### 변경 범위

**파일 1개만 수정**: `src/lib/docs-omm-import-parser.ts` (`normalizeHeader` 함수)

### normalizeHeader 정규화 규칙 추가 (순서대로 적용)

1. `D.` / `F.` prefix (점 뒤 공백 0~N개) → `draft ` / `final `
   - `d.submission planned date` → `draft submission planned date`
   - `f. response status` → `final response status`
2. 단독 `D ` / `F ` prefix이 submission/response/actual/planned/respond 앞에 올 때 → `draft `/`final `
3. `submission` 단어 제거 (SHAW 양식은 "Submission Planned Date" = "Planned Date")
   - `draft submission planned date` → `draft planned date` ✓ 매핑됨
4. `respond` → `response` (오타/변형 흡수)
   - `final actual respond date` → `final actual response date`
5. `traning` → `training` (SHAW 양식 오타)
6. 순서 정규화:
   - `draft actual response date` → `draft response actual date` (canonical은 response가 먼저)
   - `draft planned response date` → `draft response planned date`
7. 마지막 공백 정리

### 검증 (적용 후 자동 매핑되어야 할 SHAW 헤더)

| 원본 헤더 | 정규화 결과 | 매핑 필드 |
|---|---|---|
| `D.Submission Planned Date` | `draft planned date` | `draft_planned_date` ✓ |
| `D. Submission Actual Date` | `draft actual date` | `draft_actual_date` ✓ |
| `D. Response Date` | `draft response date` | `draft_response_date` ✓ |
| `D. Response Status` | `draft response status` | `draft_response_status` ✓ |
| `F.Submission Planned Date` | `final planned date` | `final_planned_date` ✓ |
| `F. Submission Actual Date` | `final actual date` | `final_actual_date` ✓ |
| `F. Response Planned Date` | `final response planned date` | `final_response_planned_date` ✓ |
| `F. Actual Respond Date` | `final response actual date` | `final_response_actual_date` ✓ |
| `F. Response Status` | `final response status` | `final_response_status` ✓ |
| `Traning Required` | `training required` | `training_required` ✓ |
| `Readible PDF` | `readible pdf` | `pdf_required_qty` ✓ (이미 등록됨) |

기존 정규 표기(`Draft Planned Date`, `Final Response Status` 등)는 그대로 통과.

### Out of Scope

- ABD / Warranty / Spare Part 파서: OMM과 다른 별도 정규화 사용 중. 향후 동일 패턴 필요 시 별도 처리.
- DB `header_mappings` 테이블에 SHAW 양식을 hardcode insert: 변경하지 않음. 코드 fallback이 모두 잡으므로 admin은 추가 작업 불필요. 필요 시 admin이 `/admin?tab=header-mappings` 에서 override 가능.

### 영향 / 리스크

- `submission` 단어를 일괄 제거하므로, "submission" 단어가 포함된 다른 의미 헤더가 OMM 시트에 있다면 영향 받음. 현재 OMM 스키마상 그런 필드 없음.
- `D./F.` prefix는 `^` (문자열 시작)에만 적용되므로 다른 위치의 `d.`/`f.`는 영향 없음.
