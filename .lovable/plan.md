
# Excel 헤더 매핑 관리 기능 (Admin)

엑셀 임포트 시 사용되는 헤더 → 시스템 필드 매핑을 코드 하드코딩에서 DB 기반으로 전환하고, Admin 페이지에서 관리할 수 있게 합니다. 기존 로직과의 충돌을 방지하기 위한 보강 사항을 모두 반영합니다.

## 1. 데이터베이스 변경

### 신규 테이블: `import_header_mappings`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| module | text | `tnc` 또는 `defect` |
| header_alias | text | 정규화된 헤더 별칭 |
| target_field | text | 시스템 필드명 (예: `issue_no`) |
| is_system | boolean | true면 Admin이 수정/삭제 불가 (필수 매핑 보호) |
| is_active | boolean | |
| note | text | 관리자 메모 |
| created_at / updated_at | timestamptz | |
| updated_by | uuid | |

- UNIQUE 제약: `(module, header_alias)` — 동일 모듈 내 별칭 중복 방지
- RLS: 읽기는 모든 인증 사용자, 쓰기는 admin/superuser만
- 시드: 기존 `import-parser.ts`, `defect-parser.ts`의 모든 별칭 (~150개) 일괄 삽입, 핵심 식별 필드(`issue_no`, `item_no`, `mos_code` 등)는 `is_system=true`로 설정

### `app_settings` 활용
- `header_mappings_version` 키를 두어, 매핑 변경 시 카운터 증가 → 클라이언트가 Realtime/refetch로 즉시 반영

## 2. 헤더 정규화 & 캐시 전략

`src/lib/header-normalize.ts` (신규)
- T&C용: 소문자, 공백 제거, 특수문자 제거
- Defect용: 위 + `(h)` 접미사 제거, 한글 처리
- 모듈별로 정규화 규칙을 명확히 분리

`src/hooks/useHeaderMappings.ts` (신규)
- React Query로 `import_header_mappings` 전체 로드 (앱 시작 시 prefetch)
- `loadHeaderMappingsCache()`: 모듈별 `Map<normalizedAlias, targetField>` 메모리 캐시 구축
- `getMappedField(module, rawHeader)`: 동기 조회 — 캐시 미스 시 기존 하드코딩 fallback

→ 비동기 호출로 인한 파서 변경 최소화. 파서는 그대로 동기 함수 유지.

## 3. 파서 수정

`src/lib/import-parser.ts`, `src/lib/defect-parser.ts`
- 기존 하드코딩된 별칭 매핑을 **fallback**으로 보존
- 각 헤더 분석 시 우선순위: `DB 캐시 → 하드코딩 fallback`
- 파서 진입점에서 `loadHeaderMappingsCache()` 보장 (앱 부팅 시 1회 prefetch + 임포트 직전 재확인)

## 4. Admin UI

`src/pages/admin/HeaderMappingsTab.tsx` (신규)
- 탭: T&C / Defect 분리
- 테이블 컬럼: Header Alias, Target Field (드롭다운, 시스템 필드 화이트리스트), System (잠금 아이콘), Active, Note, Updated
- 동작:
  - 추가/편집/비활성화 (시스템 행은 `is_system=true`라 잠금 표시, 편집 버튼 비활성)
  - **매핑 테스트 도구**: 헤더 입력 → 모듈 선택 → 정규화 결과 + 매칭된 target_field 미리보기
  - 충돌 감지: 같은 alias가 여러 번 등록되려 하면 차단
  - 검색/필터
- `src/pages/AdminPage.tsx`에 새 탭 "Header Mappings" 추가

## 5. 안전장치

- **시스템 보호 필드** (`is_system=true`)는 DB 트리거로도 수정/삭제 차단 (UI 우회 방지)
- 변경 시 `event_log`에 기록 (감사 추적)
- 하드코딩 fallback 유지로 DB가 비어도 임포트 정상 작동 (점진적 마이그레이션 안전)
- Admin UI에서 시스템 필드명은 enum/리스트로 제공 → 오타 방지

## 6. 알려진 한계

- 매핑은 단순 1:1만 지원 (1개 헤더 → 1개 필드). 복합 매핑(예: 두 컬럼 합치기)은 향후 과제
- 캐시 갱신은 `app_settings.header_mappings_version` 변경을 React Query로 polling/refetch — 실시간 즉시성보다 일관성 우선
- 사용자가 잘못된 매핑 설정 시 임포트 결과가 비어 보일 수 있음 → 매핑 테스트 도구로 사전 검증 권장

## 변경/생성 파일

- 신규 마이그레이션: `import_header_mappings` 테이블 + RLS + 트리거 + 시드 + `app_settings` 버전 키
- 신규: `src/lib/header-normalize.ts`
- 신규: `src/hooks/useHeaderMappings.ts`
- 신규: `src/pages/admin/HeaderMappingsTab.tsx`
- 수정: `src/lib/import-parser.ts`, `src/lib/defect-parser.ts` — DB 우선 + 하드코딩 fallback
- 수정: `src/pages/AdminPage.tsx` — 새 탭 추가
- 수정: `src/App.tsx` 또는 main entry — 앱 부팅 시 매핑 prefetch
Implementation complete: header mappings DB + Admin tab
