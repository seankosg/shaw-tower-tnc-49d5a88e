## 변경 내용

Defect Progress 페이지의 **Plan Mode (Baseline / Remaining)** 토글을 상단 툴바(Plan Mode 그룹)에서 떼어내, **테이블 바로 위 액션 행**(`Show past` / `Show Risk Panel` 버튼이 있는 행)으로 이동합니다.

### 레이아웃

- 액션 행을 `justify-end` → `justify-between` 으로 변경
- 왼쪽: **Plan Mode 토글 + 보조 텍스트**(예: "Excludes already-done plans" / "All planned dates count")
- 오른쪽: 기존 `Show past`, `Show Risk Panel` 버튼 유지

```text
[ Remaining | Baseline ]  설명문                [Hide past] [Show Risk Panel]
────────────────────────── Defect Schedule 테이블 ──────────────────────────
```

### 영향 파일

- `src/pages/DefectProgressPage.tsx`
  - 상단 툴바의 `<ToolbarGroup label="Plan Mode">` 블록(약 515–528행) 제거
  - 액션 행(약 581–601행)을 `flex justify-between` 으로 바꾸고 왼쪽에 동일한 ToggleGroup + 설명 span 배치
  - 동작/상태(`planMode`, `setPlanMode`, URL 동기화, Dashboard 와의 동기화)는 그대로 — 마크업 위치만 이동

### 영향 없음

- Dashboard ↔ Progress 토글 동기화 (`usePlanMode`)
- Stage View(Start/Comp/Close), Group, Bucket 등 다른 툴바 컨트롤
- S-Curve / KPI / Matrix 계산 로직