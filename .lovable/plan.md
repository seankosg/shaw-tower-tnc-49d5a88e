## 변경 계획

`src/pages/DefectDashboardPage.tsx` (라인 467–542) 의 두 배너 레이아웃을 수정합니다.

### 1. Dispute in Category 배너
- 라벨 변경: `Dispute in Category` → **`Dispute in Category for Outstanding Defects`**
- 부모 grid (`grid-cols-1 md:grid-cols-2`) 제거 → 두 배너를 세로로 쌓아 **전체 너비(full width)** 차지
- 내부 3-카드 구조(LL's CAT A / HDEC's CAT A / Difference)는 그대로 유지

### 2. HDEC's Basis of Dispute 배너
- Dispute in Category 배너 **아래에 배치**
- `hdecCatBReasons` 를 개수 내림차순 정렬 후:
  - **Top 3 항상 표시**
  - 나머지는 `Collapsible` (shadcn) 로 감싸 접기/펼치기 토글
  - **기본 상태는 접힘(collapsed)**
  - 토글 트리거: "Show N more" / "Hide" (ChevronDown 아이콘, `text-xs text-muted-foreground`)
- 4개 이하면 토글 자체를 렌더하지 않음

### 기술 메모
- `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` 는 `@/components/ui/collapsible` 에서 import
- `ChevronDown` 은 lucide-react (이미 파일에서 사용 중인지 확인 후 추가)
- 정렬 로직: `[...hdecCatBReasons].sort((a,b) => b[1]-a[1])` — 이미 정렬되어 있을 가능성 높으나 안전하게 재정렬
- 비즈니스 로직/데이터 fetch 변경 없음 — 순수 presentation 변경
