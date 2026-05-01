## Header Mappings — Target Field 기준 그룹화 뷰

현재 `HeaderMappingsTab.tsx`는 별칭(alias)을 단순 평면 테이블로 나열해서, 같은 Target Field에 어떤 별칭들이 매핑되어 있는지 한눈에 파악하기 어렵습니다. 이를 **Target Field별 그룹 카드(Accordion)** 형태로 재구성하고, 각 그룹 헤더에서 바로 별칭을 추가할 수 있도록 개선합니다.

### 변경 화면
- Admin → Header Mappings 탭 (T&C / Defect 모두)

### 새 레이아웃

```text
[T&C]  [Defect]                             [+ Add Mapping (Custom field)]

🔍 Search alias or target field…    □ Show empty fields    □ Unmapped only

┌─────────────────────────────────────────────────────────────────┐
│ ▼  hdec_pic_name           [4 aliases · 1 custom]      [+ Alias]│
├─────────────────────────────────────────────────────────────────┤
│   🔒 hdec pic                              [active] [edit][del] │
│   🔒 hdec pic name                         [active] [edit][del] │
│      pic (hdec)                            [active] [edit][del] │
│      담당자                                  [ off  ] [edit][del] │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ▶  item_no                 [2 aliases]                 [+ Alias]│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ▶  (unmapped — 3 aliases)                                       │  ← target_field가 whitelist에 없는 경우 모음
└─────────────────────────────────────────────────────────────────┘
```

- 각 그룹은 **Accordion**(`@/components/ui/accordion`)으로 펼침/접기
- 그룹 헤더: Target Field 이름 + alias 개수 뱃지 + 우측 **[+ Alias]** 버튼 (그 그룹의 target으로 alias 추가 다이얼로그를 미리 채워서 오픈)
- 그룹 본문: 해당 target에 속한 alias 행 리스트 (system은 자물쇠 아이콘, active 토글, edit, delete 그대로)
- **빈 그룹 표시 옵션**: "Show empty fields" 체크 시 alias가 0개인 system field도 그룹으로 노출 → 어디가 비어있는지 한눈에 파악 후 alias 추가 가능
- **Unmapped 그룹**: target_field가 현재 whitelist(TNC_FIELDS / DEFECT_FIELDS / custom)에 없는 alias들을 마지막 그룹으로 묶음 (정합성 점검용)
- 검색은 기존처럼 alias/target 모두 매칭. 검색 중에는 매칭된 alias가 있는 그룹만 자동 펼침.

### Add Alias 흐름 (그룹 내)
- 그룹의 [+ Alias] 클릭 시 기존 `MappingDialog`를 재사용하되, **target 필드를 prefill + readonly**로 잠가 오픈 → 같은 필드에 새 별칭만 입력
- 상단의 [+ Add Mapping]은 기존대로 target 자유 선택형 (custom field 매핑 등)

### 정렬 기준
- T&C: TNC_FIELDS 배열 순서 (스키마 의미 순)
- Defect: DEFECT_FIELDS 배열 순서
- Custom field 그룹: 별도 섹션으로 끝에 모음 ("Custom Fields" 헤더)
- Unmapped: 맨 끝

### 기존 기능 유지
- Mapping Test 도구 (정규화 미리보기) 그대로
- Active 토글, Edit, Delete, system lock 그대로
- 정규화 로직(`normalizeAlias`) 변경 없음
- DB 스키마, `useHeaderMappings` 훅, parser cache 동작 변경 없음 — 순수 UI 재구성

### 영향 파일
- `src/pages/admin/HeaderMappingsTab.tsx` — 그룹화 렌더링, prefill alias dialog, "Show empty" / 검색 자동확장 로직
- (재사용) `src/components/ui/accordion.tsx`, `MappingDialog` (target prefill prop 추가)

### 비목표
- DB 마이그레이션 없음
- import parser 동작 변경 없음
- bulk 편집/CSV import 기능은 이번 범위 밖
