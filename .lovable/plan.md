

## 3가지 요청 재정리 (실행 순서 반영)

### 요청 1: Predecessor 컬럼 날짜 포맷 + Date 필터 적용

**현재**: `predecessor_status_raw` 컬럼 ("Predecessor")은 text 필터만 적용, raw 텍스트 그대로 표시
**변경**:
- **Cell 렌더링**: 값이 날짜 패턴(ISO, dd-MMM 등)이면 `formatDdMmm()`으로 변환 표시, 아니면 원본 텍스트 표시
- **필터 유형**: `textFilterFn` → `dateRangeFilterFn`으로 변경, `meta.filterType: 'date-range'`로 변경하여 From/To + Empty only 날짜 필터 드롭다운 제공

```typescript
// 변경 전
{ accessorKey: 'predecessor_status_raw', header: 'Predecessor', size: 110,
  filterFn: textFilterFn, meta: { filterType: 'text' } },

// 변경 후
{ accessorKey: 'predecessor_status_raw', header: 'Predecessor', size: 110,
  filterFn: dateRangeFilterFn, meta: { filterType: 'date-range' },
  cell: ({ getValue }) => {
    const v = getValue() as string | null;
    if (!v) return '—';
    // 날짜 패턴이면 dd-MMM으로 변환
    if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}-[A-Za-z]{3}/.test(v))
      return formatDdMmm(v);
    return v;
  }
},
```

**수정 파일**: `src/pages/SubtestList.tsx`

---

### 요청 2: Import 시 T1/T2 Status 자동 채움 (요청 3보다 먼저 실행)

**현재**: `t1_planned_date`에 값이 있어도 `t1_status`가 비어있으면 null로 저장
**변경**: Import 파싱/처리 시:
- `t1_planned_date`에 값이 있고 `t1_status`가 null → `t1_status = 'Planned'`
- `t2_planned_date`에 값이 있고 `t2_status`가 null → `t2_status = 'Planned'`
- 신규 insert와 기존 update 모두에 적용

적용 위치 (`src/contexts/ImportContext.tsx`):
1. **신규 insert 직전** (약 315행): planned_date 있고 status null이면 'Planned' 설정
2. **기존 update 직전** (약 260행): updates 객체에 status가 null이고 planned_date가 존재하면 'Planned' 설정

**수정 파일**: `src/contexts/ImportContext.tsx`

---

### 요청 3: Hold → Delay 표현 + 자동 Delay 감지 (요청 2 완료 후 진행)

요청 2에서 Planned 자동 채움이 완료된 후, Delay 감지 로직이 정확히 동작할 수 있습니다.

**변경 1 — 용어**: Legend와 Tooltip에서 "Hold" → "Delay"
```typescript
// StageProgressLegend
<Pip state="hold" label="Delay" /> Delay

// stateLabel 함수
s === 'hold' ? 'Delay' : ...
```

**변경 2 — 자동 Delay 감지**: `classifyStatus()`와 `classifyPred()`에 planned date 파라미터 추가:
- status가 `Planned` 또는 `WIP`이고, `planned_date < today`이면 → `'hold'` (Delay) 반환
- 붉은 아이콘(⊘)은 기존 hold 스타일 그대로 유지

```typescript
function classifyStatus(s: TcStatus | null, plannedDate?: string | null): StageState {
  if (s === 'Done') return 'done';
  if (s === 'Hold') return 'hold';
  const today = new Date().toISOString().slice(0, 10);
  if ((s === 'Planned' || s === 'WIP') && plannedDate && plannedDate < today) return 'hold';
  if (s === 'WIP') return 'wip';
  if (s === 'Planned') return 'planned';
  return 'empty';
}
```

**변경 3 — StageProgress props 확장**: `t1PlannedDate`, `t2PlannedDate`, `predPlannedDate` props 추가
**변경 4 — SubtestList.tsx**: StageProgress 호출 시 planned date props 전달

**수정 파일**:
- `src/components/shared/StageProgress.tsx` — classify 함수, Legend, Tooltip 텍스트
- `src/pages/SubtestList.tsx` — StageProgress에 planned date props 전달

---

### 실행 순서
1. **요청 1** — Predecessor 컬럼 포맷 + 날짜 필터 (`SubtestList.tsx`)
2. **요청 2** — Import T1/T2 Status 자동 Planned 채움 (`ImportContext.tsx`)
3. **요청 3** — Hold→Delay + 자동 Delay 감지 (`StageProgress.tsx`, `SubtestList.tsx`)

