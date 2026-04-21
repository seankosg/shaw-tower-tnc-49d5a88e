

# Schedule Matrix — 행 높이 고정 + Stage All 시 자동 펼침

## 요약

1. 모든 행(그룹 요약 행, 스테이지 서브 행)의 높이를 고정값(예: `h-10` = 40px)으로 통일합니다.
2. Stage 필터가 `all`일 때, 클릭으로 펼치는 방식 대신 **모든 그룹의 Pred/T1/T2 서브 행이 항상 표시**되도록 변경합니다.

---

## 변경 내용

### `src/components/schedule/ScheduleMatrix.tsx`

**1. 행 높이 고정**

- 그룹 요약 행: `className`에 `h-10` 추가, 내부 패딩을 `py-2` → `py-0`으로 조정
- 스테이지 서브 행: 동일하게 `h-10` 적용, `py-1.5` → `py-0`
- `TotalDoneCells`, `PlanActualCells`의 `py` prop도 `py-0`으로 통일
- `ScheduleCell` 내부는 이미 `h-full`이므로 부모 높이가 고정되면 자동 맞춤

**2. Stage=All 시 자동 펼침**

현재 로직:
```typescript
const isExp = expanded.has(row.key) && stageFilter === 'all';
```
→ 사용자가 클릭해야 펼쳐짐

변경:
```typescript
// stageFilter === 'all'이면 항상 서브 행 표시
const showStageRows = stageFilter === 'all';
```

- 그룹 행의 chevron 아이콘 및 토글 클릭 로직 제거 (All일 때 항상 펼쳐지므로 불필요)
- `expanded` state와 `toggle` 함수는 유지하되, All 모드에서는 사용하지 않음

**3. 그룹 요약 행 스타일 조정**

- Stage=All일 때 그룹 요약 행은 combined 수치를 표시하며, 바로 아래에 3개 서브 행이 따라옴
- 그룹 행에 약간의 시각적 구분 (예: `font-semibold` + 살짝 진한 배경)

---

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/schedule/ScheduleMatrix.tsx` | 행 높이 고정, All 시 자동 펼침, chevron 제거 |

