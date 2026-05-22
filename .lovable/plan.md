## 변경 계획 — Category Dispute 영역 시각 강조

`src/pages/DefectDashboardPage.tsx` Tier 3 Priority 카드(라인 445–466)와 두 개의 Dispute 배너(라인 467–560)를 **하나의 시각 그룹**으로 묶고, 사안의 심각성이 한눈에 드러나도록 강조합니다. 데이터/로직 변경 없음 — 순수 presentation.

---

### 1. 그룹 컨테이너 신설 (Tier 3 + 2 배너 묶기)

세 블록을 감싸는 **외곽 컨테이너** 추가:
- 좌측 4px destructive 색상 accent bar (border-l-4 border-destructive)
- 연한 destructive 배경 그라데이션 (`bg-gradient-to-br from-destructive/5 via-background to-background`)
- 둥근 모서리 + 미세 그림자 (`rounded-lg shadow-sm`)
- 상단에 그룹 타이틀 행:
  - 아이콘: `AlertOctagon` (lucide-react, destructive 색)
  - 텍스트: **"Category Classification & Dispute"** (text-sm font-semibold uppercase tracking-wide)
  - 우측 보조 설명: "LL ↔ HDEC 분류 이견 — 우선 조치 필요" (text-xs text-muted-foreground)
- 내부 간격 `p-4 space-y-4`

이로써 Priority 카드 4종 + Dispute 배너 2종이 **시각적으로 하나의 사안**임이 즉시 인지됨.

### 2. Dispute in Category 배너 강조

- Card 자체에 `border-destructive/40 bg-destructive/[0.03] shadow-md` 적용
- CardTitle 옆에 `AlertTriangle` 아이콘(destructive) + "Critical" 뱃지 (`bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded`)
- 3개 내부 카드 강조:
  - LL's CAT A / HDEC's CAT A 버튼: `border-destructive/30 bg-destructive/5 hover:bg-destructive/10`
  - 숫자 폰트 `text-3xl font-bold text-destructive`
  - Difference 카드: 값이 0이 아닐 때만 강한 색(현재 emerald/destructive 유지), 0일 땐 muted

### 3. HDEC's Basis of Dispute 배너 강조

- Card에 `border-destructive/40 bg-destructive/[0.03] shadow-md`
- CardTitle 옆 `AlertTriangle` 아이콘(destructive)
- Top 3 버튼:
  - `border-destructive/40 bg-destructive/5 hover:bg-destructive/10`
  - count 뱃지: `bg-destructive text-destructive-foreground` (기존 primary → destructive)
  - 1위 항목은 추가로 `ring-1 ring-destructive/50` 로 한 단계 더 강조
- 나머지(Collapsible) 버튼: 기존 톤 유지(상대적 약함으로 위계 표현)

### 4. Priority 카드(Cat 관련) 시인성 보강

`grid-cols-2 md:grid-cols-4` (라인 445) 카드 4개:
- Cat. A 카드: `border-destructive/40 bg-destructive/[0.04]` — Major Defect 강조
- Cat. B 카드: `border-amber-500/40 bg-amber-500/[0.04]` — Minor
- No Cat. 카드: `border-muted-foreground/30 bg-muted/30` — 미분류 경고
- Total 카드: 기본 톤 유지(중립 기준점)

PriorityCard 컴포넌트가 className prop을 받지 않으면 wrapper `<div className="...">` 로 감싸 처리.

### 5. 기타

- import 추가: `AlertOctagon` (lucide-react)
- 다크 모드 대비 확인 — destructive 토큰은 이미 양쪽 모드 지원
- 반응형: 모바일에서 그룹 컨테이너 padding `p-3`, 데스크탑 `p-4`

---

### 기술 메모

- 변경 파일: `src/pages/DefectDashboardPage.tsx` 단일 파일
- 변경 라인 범위: 445–560 + import 1줄
- 사용 토큰: `destructive`, `muted`, `amber-500` (Tailwind), 모두 HSL 기반
- 로직/데이터/네비게이션 변경 없음

### 시각 위계 요약

```text
┌─ Category Classification & Dispute (group accent ─────────┐
│  [Total] [Cat.A red] [Cat.B amber] [No Cat. gray]         │
│                                                            │
│  ▣ Dispute in Category for Outstanding Defects [Critical] │
│      LL CAT A (red)  HDEC CAT A (red)  Difference         │
│                                                            │
│  ▣ HDEC's Basis of Dispute                                 │
│      [#1 ring]  [#2]  [#3]   ▾ Show N more                │
└────────────────────────────────────────────────────────────┘
```
