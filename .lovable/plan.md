## 목표

Punch Raw Data의 `progress_icon` 컬럼은 **현재의 단일 상태(Planned / WIP / Delay / Completed) 구조를 그대로 유지**하되, 시각 표현만 Defect Raw Data의 **Pip 배지 디자인**으로 교체합니다.

## 시각 변경 (Before → After)

- **Before**: Lucide 아이콘 단일 글리프 (`Circle`, `PlayCircle`, `AlertTriangle`, `CheckCircle2`) + `text-blue-600` / `text-rose-600` 등 직접 색상 클래스
- **After**: Defect의 `Pip`와 동일한 **원형 배지 1개** (h-4 w-4, border, 글리프 내부 표시)
  - `completed` → done 스타일: `bg-success border-success text-success-foreground`, 글리프 `●`
  - `wip` → wip 스타일: `bg-amber-400 border-amber-500 text-white`, 글리프 `◐`
  - `delay` → hold 스타일: `bg-destructive border-destructive text-destructive-foreground`, 글리프 `⊘`
  - `planned` → planned 스타일: `bg-transparent border-muted-foreground/40 text-muted-foreground/60`, 글리프 `○`

## 수정 파일

**`src/lib/punch-progress-icon.ts`**
- `PUNCH_PROGRESS_ICON`, `PUNCH_PROGRESS_COLOR` 매핑을 Pip 배지용 클래스 맵으로 대체 (또는 신규 export `PUNCH_PROGRESS_PIP_CLASS`, `PUNCH_PROGRESS_GLYPH` 추가)
- `computePunchProgressState`, `getPunchProgressTooltipLines`, `PUNCH_PROGRESS_LABEL`, `PUNCH_PROGRESS_STATES` 등 로직·상태값·툴팁은 **변경 없음**

**`src/pages/PunchRawDataPage.tsx` (`progress_icon` cell 약 339~360 줄)**
- 기존 `<Icon className=... />` 렌더링을 Defect `Pip` 와 동일한 `<span className="inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold leading-none border ...">{glyph}</span>` 구조로 교체
- Tooltip 내용·트리거·정렬·필터 동작 모두 유지
- 컬럼 size 60 유지

**`src/components/punch/PunchProgressLegend.tsx`**
- 4개 상태(Planned / WIP / Delay / Completed) Legend 항목의 아이콘 표시를 동일한 Pip 배지로 교체
- 텍스트 라벨·"Delay = past planned completion" 부가설명은 유지

## 변경하지 않는 것

- 단계 구성(단일 상태) 그대로 유지 — Start/Completion 분해 없음
- 상태 분류 로직(`computePunchProgressState`) 변경 없음
- DB, 컬럼 정의, 필터, 정렬, Tooltip 내용 변경 없음
- 다른 페이지(Dashboard, Detail) 영향 없음
