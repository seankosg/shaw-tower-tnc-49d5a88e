

## Subtest Master DB — 완료 단계 시인성 강화

### 현재 상태
Subtest 표에는 `Predecessor` (text), `T1 Status`, `T2 Status` (Badge) 컬럼만 있어 **언제 완료됐는지 / 어느 단계까지 완료됐는지** 한눈에 안 보임. 상태 Badge는 4색(Planned/WIP/Done/Hold)이지만 행 단위 진행도가 직관적이지 않음.

### 제안: 3단계 옵션 (조합 가능)

#### 옵션 A — Stage Progress 컬럼 (추천, 신규 단일 컬럼)
한 행의 Pred → T1 → T2 진행 상태를 **3-pip 가로 인디케이터**로 시각화. 기존 컬럼 유지하면서 맨 앞 또는 Item No 옆에 추가.

```
●━━●━━○   Pred ✓ → T1 ✓ → T2 (WIP/계획)
●━━◐━━○   Pred ✓ → T1 진행중 → T2 미시작
●━━●━━●   완료 (전 단계 Done)
○━━○━━○   미시작
⊘ ━━●━━○   Hold 표시
```

- **Pred**: `predecessor_status_raw`가 "Done/완료/Cleared" 등이면 ●, T1이 시작됐어도 ● (옵션 1 로직 재사용)
- **T1 / T2**: status별 아이콘 — Done=●(초록), WIP=◐(앰버), Planned=○(회색), Hold=⊘(빨강)
- 호버 툴팁에 각 단계 status + actual_date 표시
- 너비 ~80px, 시각적 노이즈 최소

#### 옵션 B — 행 좌측 컬러 바 (Row Status Stripe)
표 첫 셀 좌측 4px 세로 바로 **전체 완료도** 즉시 인식.
- T2 Done → 초록 / T1 Done & T2 미완 → 파랑 / T1 WIP → 앰버 / Pred만 완료 → 옅은 회색 / 미시작 → 투명 / Hold → 빨강

#### 옵션 C — Done 행 디밍 + Done 날짜 강조
- T2 Done인 행은 배경 `bg-muted/30` + 텍스트 `text-muted-foreground` (완료된 작업은 시각적으로 후순위)
- `T1 Actual` / `T2 Actual` 컬럼 추가 (현재 Planned만 표시) → Done인 셀은 **굵은 초록 텍스트 + ✓ 아이콘**, 지연 완료(actual > planned)는 빨간 ✓

#### 옵션 D — StatusBadge 강화
기존 Badge에 아이콘 추가 + Done에 더 진한 강조:
- Done: `✓` 아이콘 + 진한 초록 배경 (현재는 옅음)
- WIP: 작은 펄스 닷
- Planned: 점선 테두리만 (배경 없음)
- Hold: `⊘` 아이콘

### 추천 조합: **A + C**
- 옵션 A로 행마다 Pred/T1/T2 진행도를 한눈에 (정렬·필터 안 막음)
- 옵션 C로 완료된 행은 시각적 후순위 처리 + Actual 날짜 강조 (지연 완료 즉시 식별)

### 추가 미니 기능
- 표 상단에 **Legend** (●=Done, ◐=WIP, ○=Planned, ⊘=Hold) 한 줄
- Stage Progress 컬럼 클릭 → 단계별 정렬 (T2 완료 우선 / 미시작 우선 토글)

### 변경 파일 (옵션 A+C 채택 시)
| 파일 | 변경 |
|---|---|
| `src/components/shared/StageProgress.tsx` (신규) | Pred/T1/T2 3-pip 컴포넌트 + 툴팁 |
| `src/pages/SubtestList.tsx` | StageProgress 컬럼 추가 (Item No 다음), T2 Done 행 디밍, T1/T2 Actual 컬럼 추가, Legend 표시 |
| `src/components/shared/StatusBadge.tsx` | (선택) Done에 ✓ 아이콘 추가 |

DB / migration / edge function 변경 없음.

### 결정 필요
어떤 옵션(또는 조합)을 적용할지 — **A+C 추천**, 또는 다른 조합 알려주세요.

