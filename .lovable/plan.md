

## Schedule Matrix 컬럼 그룹 시각적 구분

### 변경사항

좌측 sticky 영역의 8개 sub-column을 두 개의 논리 그룹으로 명확히 구분:
- **Total Scope** (Total / Done / % / Remain)
- **Up to Today** (Plan / Actual / % / Diff)

### 구현 방식 (2단 헤더 + 배경색 구분)

#### 1. 헤더를 2단으로 변경
기존 1단 헤더 위에 그룹 헤더 행 추가:

```text
| Group(200) |    Total Scope        |    Up to Today        | ...buckets...
|            | Total Done  %  Remain | Plan Actual  %  Diff  |
```

- 1단 (그룹 헤더): `Total Scope` (192px) | `Up to Today` (192px)
- 2단 (sub-header): 기존 8개 컬럼 라벨

#### 2. 배경색으로 그룹 시각적 구분
- **Total Scope** 그룹: `bg-muted` 유지 (현행)
- **Up to Today** 그룹: `bg-secondary/40` (살짝 다른 톤)
- 그룹 사이에 굵은 구분선 (`border-l-2 border-border`)

#### 3. 데이터 행에도 동일한 그룹 배경 적용
- 그룹 행과 Stage sub-row 양쪽 모두 일관되게 두 블록 배경색 차이 유지

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/components/schedule/ScheduleMatrix.tsx` | 헤더 2단 구조로 재구성, 두 블록에 배경색 적용, `TotalDoneCells`/`PlanActualCells`에 그룹 배경 prop 추가 |

### 비변경
- 컬럼 폭 (W_GROUP=200, W_NUM=48, W_PCT=48) 유지
- 좌측 sticky 폭 584px 유지
- 계산 로직, ScheduleCell, KPI strip 변경 없음

### 검증
1. 헤더에 `Total Scope` / `Up to Today` 두 그룹 라벨이 sub-header 위에 표시
2. 두 그룹의 배경색이 시각적으로 구분
3. 가로 스크롤 시 sticky left 영역에서도 그룹 구분이 유지
4. Stage 토글(All/Pred/T1/T2) 모두에서 동일하게 표시

