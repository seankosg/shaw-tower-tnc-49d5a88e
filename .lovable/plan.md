

# Progress Status — PIC 그룹 필터 추가 + Gantt-lite Excel 내보내기

## 1. PIC 그룹 필터 추가

### `src/lib/schedule-utils.ts`

- **Line 8**: `ScheduleGroupBy` 타입에 `'hdec'` 추가
  ```ts
  export type ScheduleGroupBy = 'system' | 'subcon' | 'subsub' | 'hdec' | 'team';
  ```
- **Line 100-105**: `getGroupKey`에 hdec 분기 추가
  ```ts
  if (by === 'hdec') return s.hdec_pic_name ?? '(None)';
  ```

### `src/pages/SchedulePage.tsx`

- **Line 27-31** `GROUP_LABELS`: `hdec: 'PIC'` 추가
- **Line 245-246** Group Tabs: `<TabsTrigger value="hdec">PIC</TabsTrigger>` 추가 (Team 앞에)
- **Line 175** `filterParamForGroup`: `groupBy === 'hdec' ? 'hdec_pic'` 분기 추가

---

## 2. Gantt-lite 테이블 Excel 내보내기

### `src/lib/schedule-excel-export.ts` (신규 생성)

`xlsx-js-style`을 사용하여 현재 화면의 Schedule Matrix 데이터를 스타일링된 Excel로 내보냅니다.

**함수**: `exportScheduleToExcel(data, opts)`

**Excel 레이아웃:**

```text
Row 0: Title — "SHAW T&C — Progress Status (By System)"  [Navy #1E3A5F, 흰색 14pt Bold]
Row 1: Meta — "Exported: ... · Stage: All · Range: ..."   [Light Gray #F3F4F6]
Row 2: (spacer)
Row 3: Group headers — [Group] | Total Scope (4열 병합) | Up to Today (4열 병합) | Timeline bucket labels
Row 4: Sub headers — | Total | Done | % | Remain | Plan | Actual | % | Diff | Apr 21 | Apr 22 | ...
Row 5+: Data
```

**데이터 행 구조:**

| 구분 | 스타일 |
|------|--------|
| 그룹 요약행 | `#F8FAFC` 배경, Bold |
| Stage 서브행 (stageFilter=all일 때) | 들여쓰기 `├ Pred`, `├ T1`, `└ T2` |
| Timeline 셀 | `{plan}/{actual}` 형태, 값 0이면 빈 셀 |
| Today 열 | 연한 파란 배경 `#DBEAFE` |
| Diff/Remain 음수 | 빨간 폰트 `#DC2626` |
| Diff/Remain 양수 | 초록 폰트 `#16A34A` |

**기타:**
- Freeze panes: 좌측 고정열(Group + Total Scope + Up to Today) + 헤더 2행 고정
- 파일명: `SHAW_Schedule_{GroupHeader}_{Stage}_{YYYYMMDD_HHmm}.xlsx`

### `src/pages/SchedulePage.tsx`

- **Import 추가**: `Download` lucide 아이콘, `exportScheduleToExcel`, `useToast`
- **Header 영역** (line 225-234): Download 버튼 추가
- **핸들러**: `handleScheduleExport()` — `visibleData` + 현재 필터 옵션 전달

---

## 3. 이전 미적용 플랜 반영 (Stage별 수량 표시)

### `src/pages/DashboardPage.tsx` — Line 737

Stage 배지 옆에 `cumActual/totalSubtests (remaining)` 표시:
```
[Pred]  28/120 (92)
[T1]    38/120 (82)
[T2]    15/120 (105)
```

### `src/lib/dashboard-excel-export.ts` — Line 183-184

Stage 셀 값에 동일 수량 정보 포함: `"Pred  28/120 (92)"`

---

## 변경 파일 요약

| 파일 | 작업 |
|------|------|
| `src/lib/schedule-utils.ts` | `ScheduleGroupBy`에 `'hdec'` 추가, `getGroupKey`에 hdec 분기 |
| `src/pages/SchedulePage.tsx` | PIC 탭 추가, filterParamForGroup hdec 분기, Excel 다운로드 버튼 + 핸들러 |
| `src/lib/schedule-excel-export.ts` | 신규 — Schedule Matrix Excel 내보내기 |
| `src/pages/DashboardPage.tsx` | Stage 셀에 cumActual/total (remaining) 표시 |
| `src/lib/dashboard-excel-export.ts` | Stage 셀 값에 수량 정보 추가 |

