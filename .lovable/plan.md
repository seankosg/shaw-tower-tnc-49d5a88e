## 목표

Punch Raw Data 테이블의 Stage 컬럼 옆에 **Progress Icon** 컬럼을 추가하여 한 개의 색상/모양 아이콘으로 4가지 상태(Planned / WIP / Delay / Completed)를 표시합니다.

## 상태 판정 로직 (`actual_progress_pct` + 날짜 기준)

순서대로 평가:

1. `actual_progress_pct >= 100` 또는 `actual_completion_date` 존재 → **Completed**
2. `planned_completion_date < today` 이고 미완료 → **Delay**
3. `actual_progress_pct > 0` 또는 `actual_start_date` 존재 → **WIP**
4. 그 외 → **Planned**

Summary 행도 동일 로직 적용 (롤업된 `actual_progress_pct` / 날짜 사용).

## 아이콘 매핑 (lucide-react)

| 상태 | 아이콘 | 색상 |
|---|---|---|
| Planned | `Circle` (빈 원) | muted |
| WIP | `PlayCircle` | blue |
| Delay | `AlertTriangle` | rose |
| Completed | `CheckCircle2` | emerald |

Tooltip으로 라벨 표시.

## 변경 사항

1. **신규** `src/lib/punch-progress-icon.ts` — `computePunchProgressState(row)` + 아이콘/라벨/색상 매핑.
2. **마이그레이션** — `punch_field_config`에 가상 컬럼 `progress_icon` 추가 (`display_name='Progress'`, `sort_order=16`, `source_origin='system'`).
3. **`src/lib/punch-field-registry.ts`** — `progress_icon` 가상 필드 등록 (`readOnly: true`, group `progress`).
4. **`src/pages/PunchRawDataPage.tsx`** — `renderCell`에 `progress_icon` case 추가, 정렬/필터/편집 비활성화.

## 제외

- Export/Import에서는 가상 컬럼이라 제외
- DB `punch_items` 스키마 변경 없음 (계산 기반)
- Detail 페이지, 권한/RLS 변경 없음
