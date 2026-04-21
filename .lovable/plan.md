

# Plan vs Actual Breakdown — Excel 내보내기 (스타일 최적화)

## 요약

대시보드의 "Plan vs Actual — Breakdown" 테이블을 현재 선택된 탭(System/Subcontractor/Sub-Sub/HDEC PIC/Team) 기준으로 스타일링된 Excel 파일로 내보내는 기능을 구현합니다.

## Excel 시트 레이아웃

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Row 1  │ SHAW T&C — Plan vs Actual (By System)          [Title: navy bg]    │
│ Row 2  │ Exported: 2026-04-21 14:30                     [Meta: light gray]  │
│ Row 3  │ (blank spacer)                                                     │
├────────┼──────────────────────────────────────────────────────────────────── │
│ Row 4  │ [Group] │ Total │ Stage │ To-Yesterday(Cum)│ Yesterday  │ Today    │
│        │         │       │       │ Plan│Act │ Δ     │ Plan│Act│Δ │Plan│Act│Δ│
│ Row 5  │         │       │       │ (2nd header row — sub-columns)           │
├────────┼──────────────────────────────────────────────────────────────────── │
│ Row 6+ │ SYS-01  │  120  │ Pred  │  30 │ 28 │  -2  │  5 │ 4│-1│ 3 │ 2│-1  │
│        │         │       │ T1    │  40 │ 38 │  -2  │  8 │ 7│-1│ 5 │ 4│-1  │
│        │         │       │ T2    │  20 │ 15 │  -5  │  3 │ 2│-1│ 2 │ 1│-1  │
│        │─────────│───────│───────│──────────────────│──────────│────────── │
│        │ SYS-02  │   85  │ Pred  │ ...                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 스타일링 상세

기존 `excel-export.ts`의 디자인 시스템을 확장합니다.

| 영역 | 배경색 | 폰트 | 특이사항 |
|------|--------|------|----------|
| **Title** (Row 1) | Navy `#1E3A5F` | Calibri 14pt Bold 흰색 | 전체 열 병합 |
| **Meta** (Row 2) | Light Gray `#F3F4F6` | Calibri 10pt 회색 | 전체 열 병합 |
| **Group Header** (Row 4) | Slate `#334155` | Calibri 11pt Bold 흰색 | "To-Yesterday", "Yesterday", "Today" 3열씩 병합 |
| **Sub Header** (Row 5) | Slate `#475569` | Calibri 10pt Bold 흰색 | Plan / Actual / Δ |
| **Group Name 셀** | `#F8FAFC` 연한배경 | Calibri 10pt Bold 검정 | 3행 세로병합 (Pred/T1/T2) |
| **Stage Badge** | 없음 | Calibri 10pt | Pred=회색, T1=파랑, T2=초록 폰트색 |
| **Δ 음수** | 없음 | 빨간 폰트 `#DC2626` | 지연 강조 |
| **Δ 양수** | 없음 | 초록 폰트 `#16A34A` | 초과달성 표시 |
| **Δ 0** | 없음 | 회색 폰트 `#9CA3AF` | "—" 표시 |
| **Progress %** | 마지막 열 | Calibri 10pt | 숫자 + "%" |
| **그룹 구분선** | — | — | 각 그룹 첫 행 상단에 두꺼운 border |

## 변경 파일

### 1. `src/lib/dashboard-excel-export.ts` (신규 생성)

- `xlsx-js-style` 사용 (이미 설치됨)
- `exportPlanActualToExcel(rows, groupHeader, today, yesterday)` 함수
- 2-row merged header 구조 (Group Header + Sub Header)
- 그룹당 3행 (Pred/T1/T2), 그룹명·Total 셀 세로병합
- Δ 값에 조건부 색상 (음수=빨강, 양수=초록, 0=대시)
- Progress % 열 추가
- 파일명: `SHAW_PlanVsActual_{GroupHeader}_{YYYYMMDD_HHmm}.xlsx`

### 2. `src/pages/DashboardPage.tsx` (수정)

- `Tabs` 컴포넌트의 `value`를 state로 관리 (`activeBreakdownTab`)
- CardHeader에 Download 아이콘 버튼 추가
- 버튼 클릭 시 현재 탭에 해당하는 `PlanActualRow[]` 데이터로 export 함수 호출
- `Download` 아이콘 lucide import 추가

