

# Plan vs Actual 테이블 — Stage별 실적/잔여 수량 표시

## 변경 내용

### 1. `src/pages/DashboardPage.tsx` — Stage 셀 수정

현재 Stage 열에는 배지만 표시됩니다:
```
[Pred]
[T1]
[T2]
```

변경 후 배지 옆에 **완료수/총수 (잔여)** 형태로 표시합니다:
```
[Pred]  28/120 (92)
[T1]    38/120 (82)
[T2]    15/120 (105)
```

- `cumActual` = 현재까지 완료된 수
- `totalSubtests` = 전체 서브테스트 수
- `(잔여)` = `totalSubtests - cumActual`
- 숫자는 `text-[10px] tabular-nums text-muted-foreground` 스타일로 배지 옆에 표시
- `/총수`와 `(잔여)`는 더 흐린 색상 (`text-muted-foreground/50`, `/70`)으로 시각적 계층 구분

**수정 위치**: line 737 — `<StageBadge>` 셀을 확장하여 옆에 수량 텍스트 추가

### 2. `src/lib/dashboard-excel-export.ts` — Excel에도 동일 정보 반영

Stage 열(col 2)에 `"Pred  28/120 (92)"` 형태로 텍스트 포함하여 Excel 내보내기에서도 동일한 정보가 표시되도록 수정

## 변경 파일

| 파일 | 작업 |
|------|------|
| `src/pages/DashboardPage.tsx` | Stage 셀에 cumActual/total (remaining) 표시 |
| `src/lib/dashboard-excel-export.ts` | Stage 셀 값에 수량 정보 추가 |

