

## Schedule 페이지에 "Date Picker" 추가 — 특정 날짜 클릭 시 해당일 Subtest 리스트 조회

### 목적
사용자가 특정 날짜를 선택하면 그날 계획된(또는 실적이 발생한) 모든 subtest를 SubtestList에서 바로 조회. 미래 일일 계획 사전 검토 + 과거 실적 회고 양쪽 용도.

### UI 위치
SchedulePage 상단 Toolbar의 우측(Legend 옆) 또는 KPI 카드 위에 새 행:
```
[📅 Pick a date  ▼]   [Plan ▾]  [Go →]
```
- **Date Picker**: shadcn `Calendar` + `Popover` (오늘 default)
- **Field 선택**: Plan / Actual 작은 토글 (default Plan — 사전 검토 목적)
- **Go 버튼**: 클릭 시 `/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&date_field=planned|actual` 로 navigate
- 날짜 선택 직후 자동 navigate (Go 버튼 생략 가능 — 더 빠름)

### 동작
- 선택 날짜 → SubtestList의 기존 URL 필터(`date_from`, `date_to`, `date_field`)와 동일 메커니즘 사용 → 추가 백엔드 작업 없음
- `date_from === date_to`면 "그날 단일" 의미
- Plan 모드: status 무관 (해당일 계획된 모든 subtest, 어제 plan 클릭 버그 수정 때와 동일 의미)
- Actual 모드: 자동으로 `cell_status=Done` 추가 (해당일 완료된 subtest)

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/pages/SchedulePage.tsx` | Toolbar에 DatePicker + Field 토글 + navigate 핸들러 추가. `Calendar`, `Popover`, `format` import |

### 구현 스니펫
```tsx
const [pickedDate, setPickedDate] = useState<Date | undefined>(new Date());
const [pickedField, setPickedField] = useState<'planned'|'actual'>('planned');

const handleDatePick = (d: Date | undefined) => {
  if (!d) return;
  setPickedDate(d);
  const iso = format(d, 'yyyy-MM-dd');
  const params: Record<string,string> = {
    date_from: iso, date_to: iso, date_field: pickedField,
  };
  if (pickedField === 'actual') params.cell_status = 'Done';
  navigate(`/?${new URLSearchParams(params).toString()}`);
};
```

### 검증
1. Toolbar에서 오늘 날짜 클릭 → SubtestList로 이동, 오늘 plan된 subtest 표시
2. 과거 날짜 + Actual 모드 → 그날 완료된 subtest만 표시
3. 미래 날짜 + Plan 모드 → 그날 계획된 모든 subtest (status 무관) 표시
4. 좁은 viewport(997px)에서 Toolbar wrap 정상

