## 문제 원인

업로드 파일의 헤더는 "Overall Status"인데 ABD import 파서(`src/lib/docs-import-parser.ts`)는 다음만 인식합니다:
- `'status'` → `current_status`
- `'aconex status'` → `current_status`

DB의 `import_header_mappings` 테이블에는 `'overall status'` → `current_status` 매핑이 등록되어 있지만, 이 파서는 DB 캐시(`header-mappings-cache.ts`)를 **참조하지 않고** 하드코딩된 `FIELD_ALIASES` 맵만 사용합니다. 그래서 매핑에 실패합니다.

(참고: T&C/Defect 파서들은 캐시를 사용하는 것으로 보이며, ABD 파서만 누락된 상태입니다.)

## 수정 내용

### 1. `src/lib/docs-import-parser.ts` — 두 가지 보완

**A) 즉시 해결 — 정적 alias 추가**
`FIELD_ALIASES`와 `mapHeader` 휴리스틱에 "overall status" 계열 표현 추가:
- `'overall status'` → `current_status`
- `'overall'` (단독) → `current_status`
- 휴리스틱: `norm.includes('overall') && norm.includes('status')` → `current_status`

**B) 근본 해결 — DB 매핑 캐시 연동**
`mapHeader()`에서 정적 `FIELD_ALIASES` 매칭 실패 시 `getMappedField('docs', norm, 'as_built')` 호출하여 DB 등록 alias도 인식하도록 변경. 이렇게 하면 향후 사용자가 Admin에서 alias를 추가했을 때 ABD import에서도 즉시 적용됩니다.

캐시는 앱 부팅 시 이미 로드되므로(다른 모듈에서 사용 중) 추가 호출 없이 동기적으로 lookup만 추가하면 됩니다.

### 2. 검증

- 수정 후 동일 파일 재import → "Overall Status" 컬럼이 `current_status`로 매핑되어 미리보기에 표시되는지 확인
- 기존 `'status'`, `'aconex status'` 헤더 동작 회귀 없음 확인

## 변경 파일

- `src/lib/docs-import-parser.ts` (alias 추가 + DB 캐시 fallback 호출 1줄)

DB 마이그레이션은 필요 없습니다 (DB에는 이미 alias가 등록되어 있음).
