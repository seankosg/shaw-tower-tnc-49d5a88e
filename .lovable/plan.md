## 목표

OMM / Warranty / Spare Part 상세 페이지의 다음 필드를 **마스터 기반 풀다운(Select)** 으로 통일합니다.

- `subcontractor_name` → `subcontractor_master` (active sub/subsub)
- `hdec_pic_name` → `hdec_pic_master` (active)
- `hdec_eng_name` → `profiles` (active)
- `team` → 공통 enum (`Mech / Elec / Arch / Supp / Design`)

모두 `src/hooks/useCommonMasters.ts` (60초 캐시 + `unionWithLegacy`) 를 단일 소스로 사용합니다.

## 현재 상태

| 페이지 | sub/pic/eng | team |
|---|---|---|
| OMM Detail | `SuggestField` (자유 입력 + 제안) — 자체 fetch | `Select` ✓ |
| Spare Part Detail | `SuggestField` (자유 입력 + 제안) — 자체 fetch | `Select` ✓ |
| Warranty Detail | 일반 `Input` (자유 입력) | 일반 `Input` |

세 페이지 모두 `subcontractor_master / hdec_pic_master / profiles` 를 직접 조회하거나 입력에 자유 텍스트를 허용 → 마스터에 없는 값이 들어갈 수 있음.

## 변경 사항

### 1. 공통 hook 도입
세 상세 페이지에서 자체 fetch 코드를 제거하고 `useCommonMasters()` 로 교체:
- `subcontractorOptions`, `hdecPicOptions`, `hdecEngOptions`, `teamOptions` 사용
- 기존 행 값이 마스터에 없을 경우 `unionWithLegacy(master, [row.value])` 로 머지하여 `(legacy)` 표시 → 데이터 손실 없이 표시/저장 가능

### 2. FieldEditor 변경
- **`subcontractor_name` / `hdec_pic_name` / `hdec_eng_name`**: `SuggestField` 또는 `Input` 제거 → `Select` 로 통일
  - `__none__` (—) 옵션 포함하여 비우기 가능
  - 옵션은 마스터 + legacy(현재 값이 마스터에 없을 때만)
- **`team` (Warranty 만)**: `Input` → `Select` (`teamOptions`)

### 3. 영향 범위 (UI/표현 계층만)

| 파일 | 변경 |
|---|---|
| `src/pages/docs/DocsOMMDetailPage.tsx` | 자체 마스터 fetch 제거 → `useCommonMasters`. `SuggestField` → `Select`. |
| `src/pages/docs/DocsSparePartDetailPage.tsx` | 동일 |
| `src/pages/docs/DocsWarrantyDetailPage.tsx` | sub/pic/eng/team 4개 필드를 `Select` 로 (마스터 연결) |

### 4. 변경하지 않는 것
- DB 스키마, RLS, 마스터 테이블 자체, Raw Data 페이지 인라인 편집/Bulk 액션 (다른 작업에서 처리)
- Import 흐름의 마스터 자동 생성 로직
- 권한 체크(`canEditRow`) — 기존 그대로 사용
- 변경 로그(`docs_change_log`) 작성 로직

## 기술 노트

- `useCommonMasters` 는 60초 모듈 캐시 + 단일 inflight 보장 → 페이지 전환 시 중복 호출 없음.
- legacy 옵션은 표시용 라벨만 `"<value> (legacy)"` 로 변경되고 저장 값은 원본 그대로 유지.
- 마스터 옵션이 비어있는 동안(`loading`) `Select` 는 현재 값(있다면)만 노출하고 비활성 상태로 표시.
