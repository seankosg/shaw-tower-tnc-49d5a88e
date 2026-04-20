

## Lookup Go 버튼에 Stage 필터 동시 반영

### 현재 동작
Go 클릭 시 `date_from`, `date_to`, `date_field`(+ Actual이면 `cell_status=Done`)만 전달. Toolbar의 다른 설정은 무시됨.

### 각 Toolbar 항목별 연동 가능성
| Toolbar | SubtestList 연동 | 처리 |
|---|---|---|
| **Group** (system/subcon/subsub) | 불가 — 그룹 "기준"일 뿐 특정 값 X | 전달 안 함 |
| **Bucket** (day/week) | 불가 — Schedule 시각화 옵션 | 전달 안 함 |
| **Stage** (all/pred/t1/t2) | **가능** — `t1_status` / `t2_status` 매핑 | **전달** |
| **Range** (14~90d) | 불가 — Schedule 보기 범위 | 전달 안 함 |
| **Hide past** | 불가 — Schedule 표시 토글 | 전달 안 함 |

### 변경 내용
`src/pages/SchedulePage.tsx` Go 버튼 onClick에 stageFilter 반영:
- `stageFilter === 't1'` → 추가로 `cell_stage=t1` (cell click과 동일한 의미로 stage를 좁힘)
- `stageFilter === 't2'` → `cell_stage=t2`
- `stageFilter === 'pred'` → `cell_stage=pred`
- `stageFilter === 'all'` → 추가 없음

단, SubtestList는 현재 `cell_stage` 파라미터를 인식하지 않으므로, **기존에 cell click에서 쓰던 `stage` 파라미터 컨벤션을 동일하게 재사용**합니다(handleCellClick에서 이미 `params.stage = stage` 사용 중). 즉 Go 버튼도 `params.stage = stageFilter` 만 추가.

### 검증
1. Stage=T1 + 미래 날짜 + Plan → 그날 T1 계획된 subtest만 조회
2. Stage=All + 오늘 + Actual → 오늘 완료된 모든 stage subtest 조회
3. Stage=Pred + 과거 날짜 + Actual → 그날 Pred 완료된 subtest만 조회

### 사용자 안내(UI)
Lookup 그룹 옆에 작은 헬퍼 텍스트 한 줄 추가:
> "Applies current Stage filter. Group/Bucket/Range are view-only options."

→ 어떤 필터가 같이 가고 어떤 게 안 가는지 사용자가 바로 이해.

