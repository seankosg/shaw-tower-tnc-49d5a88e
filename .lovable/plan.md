## 목표

Admin → **Masters** 탭의 Subcontractor Master를 "협력사 + Aconex Aliases + Sub-Subs + 미매핑 큐"를 한 화면에서 직관적으로 다룰 수 있는 통합 UI로 재구성합니다. 좁은 1/3 컬럼 안에 모든 걸 욱여넣은 현재 구조를 풀고, **마스터 데이터(46개 협력사)** 와 **운영 워크플로우(매핑 큐)** 를 한 시야에 두 영역으로 분리합니다.

## 현재 문제

- Subcontractor Master 카드가 `md:grid-cols-3` 안의 1/3 폭에 갇혀 Aliases chip / Owner Code / Sub-Sub / Unmapped 큐가 겹쳐 보임
- 협력사 46개를 200px 스크롤 박스에서 봐야 하고 검색/필터 없음
- Unmapped 큐가 카드 끝에 매번 깔려 있어 "처리할 게 없는 평상시"에도 시야를 차지
- Aliases chip 추가 다이얼로그가 행마다 트리거되지만 어떤 협력사인지 한눈에 안 들어옴

## 새 레이아웃

```text
Masters Tab
┌─────────────────────────────────────────────────────────────────────┐
│ Toolbar:  [🔍 search]  [Type: All ▾]  [☐ Show inactive]            │
│           [Sync Missing Users]   ⚠ 3 unmapped aliases [Resolve →]   │
├──────────────────────────────────┬──────────────────────────────────┤
│  Subcontractors (46) [+ Add]     │  HDEC PIC (12)        [+ Add]    │
│  ┌────────────────────────────┐  │  ┌───────────────────────────┐  │
│  │ Master row (expandable)    │  │  │ name │ active │ delete    │  │
│  │  ▸ Samsung C&T  SCT  [3]   │  │  └───────────────────────────┘  │
│  │  ▸ HDEC Electric HDE [1]   │  │  HDEC ENG (8)         [+ Add]    │
│  │  ▾ POSCO E&C     PEC [0]   │  │  ┌───────────────────────────┐  │
│  │     ── Sub-Subs ──────     │  │  │ ...                        │  │
│  │     • PEC Mech (재하도)    │  │  └───────────────────────────┘  │
│  │     ── Aconex Aliases ─    │  │                                  │
│  │     [POSCO×][P-ENC×][+Add] │  │                                  │
│  └────────────────────────────┘  │                                  │
└──────────────────────────────────┴──────────────────────────────────┘
                ▼ (collapsible, opens when count > 0)
┌─────────────────────────────────────────────────────────────────────┐
│ Unmapped Aconex Aliases (3)             [Bulk: ignore selected]     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ raw_label          │ Suggested            │ Map to    │ × │ │
│ │ ☐ │ HDEC ELEC SUB1     │ HDEC Electric (92%)  │ [select▾] │ × │ │
│ │ ☐ │ Samsung C&T Corp.  │ Samsung C&T  (88%)   │ [select▾] │ × │ │
│ │ ☐ │ Random Vendor Pty  │ —                    │ [select▾] │ × │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 변경 사항

### 1. 그리드 재배치 (`MastersTab`)

- 기존 `md:grid-cols-3`(셋 다 1/3) → `lg:grid-cols-3`에서 **Subcontractor 카드가 2칸 차지**, HDEC PIC/ENG는 우측에 세로 스택
- 모바일에서는 1열 스택 유지

### 2. 통합 툴바 (Subcontractor 카드 헤더)

- **검색 입력** (이름 / Owner Code / Alias 라벨 모두에 매칭)
- **Type 필터**: All / Subcontractors only / Sub-Subs only
- **Show inactive** 토글 (기본 off)
- **Unmapped 카운터 Badge** + "Resolve" 버튼 (클릭 시 페이지 하단 큐로 스크롤 + 펼침)

### 3. Master 행 = 확장 가능한 단일 행

각 협력사를 한 줄로 압축하고 펼치면 상세가 나오는 패턴:

- **접힌 행 (한 줄)**: `▸  이름  |  Owner Code  |  alias 개수 Badge  |  sub-sub 개수 Badge  |  Active 토글  |  ⋯ (rename/delete)`
- **펼친 패널**:
  - **Sub-Subs (재하도)** 인라인 리스트 + "+ Add Sub-Sub" 버튼 (현재 별도 폼이던 Sub-Sub 추가 UI를 이쪽으로 이동 → 부모 컨텍스트가 항상 명확)
  - **Aconex Aliases** chip 영역 + 인라인 입력창 (별도 다이얼로그 제거 → 클릭→입력→Enter 한 번으로 완료, "어떤 협력사에 추가하는지" 항상 보임)
- 펼침 상태는 컴포넌트 로컬 state로 관리. 검색 결과는 자동 펼침.

### 4. Sub-Sub 추가 UX 통합

- 카드 바깥의 별도 "Sub-Sub 추가 폼"(parent 선택 필요)을 **삭제**
- Sub-Sub은 "부모 협력사 행 펼침 → Add Sub-Sub" 으로만 추가 → parent 선택 실수 가능성 0

### 5. Unmapped Aliases 큐 (별도 카드, 조건부)

- `unmappedAliases.length === 0` 일 때는 **렌더 안 함** (평상시 시야에서 사라짐)
- 0보다 크면 **Subcontractor 카드 아래 collapsible 카드**로 항상 펼친 상태 표시
- 컬럼:
  - **Suggested**: 기존 `master-name-match.ts` 의 `findSimilarMasterName()` 로 raw_label과 가장 유사한 활성 협력사 + 점수. 점수 ≥ 0.85면 한 클릭 "Accept"
  - **Map to**: SearchableSelect (활성 협력사 목록)
  - **Ignore (×)**: `is_active=false`
- **Bulk actions**: 체크박스 → 선택 항목 일괄 Ignore / 일괄 Accept suggested
- 헤더에 새로고침 버튼 (다른 사용자가 import 후 큐 갱신)

### 6. 마이크로 인터랙션

- Alias chip × hover → destructive 색
- 행 추가/삭제 시 row 단위 fade (동일 패턴 다른 화면과 일관)
- Sticky 헤더(스크롤 시 Toolbar/컬럼 헤더 고정)
- Empty state: "No subcontractors yet — add your first one above."

## 기술적 노트

- 검색은 normalize(NFKD + lowercase + 공백 trim)로 name / owner_code / 매핑된 alias.raw_label 모두에서 매칭
- Suggested 매칭: 이미 있는 `findSimilarMasterName` 재사용 (threshold 0.72)
- Sub-Sub 행은 펼침 패널 안에서만 노출 → 별도 "Sub-Subs" 섹션 완전 제거
- 데이터 fetch는 단일 `load()` 유지 (subcontractor_master + docs_org_alias 동시)
- 펼침 상태: `useState<Set<string>>`
- 컴포넌트 분할: `MasterRow`, `AliasChips`, `SubSubList`, `UnmappedQueue` 로 분리해 가독성 확보

## 변경되는 파일

| 파일 | 변경 |
|---|---|
| `src/pages/AdminPage.tsx` | `MastersTab` 그리드 재배치, `SubcontractorMasterTable` 전면 재작성 (Toolbar + 확장 행 + 인라인 alias/sub-sub) |
| `src/components/admin/UnmappedAliasQueue.tsx` (신규) | 미매핑 큐 컴포넌트 분리 (suggested matching, bulk actions) |
| `src/components/admin/SubcontractorRow.tsx` (신규) | 확장 행 컴포넌트 분리 |

## 범위 외 (다음 단계)

- 협력사 ↔ Defect/Subtest 통계 표시 (예: 행에 "12 active defects" tooltip)
- Aconex sub-module 별 alias 분리 (현재는 단일 풀)
- 다음 단계 후보: Dashboard 위젯 또는 Drawing Detail

승인하시면 위 구조로 구현하겠습니다.
