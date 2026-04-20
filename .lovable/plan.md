

## Plan 막대 클릭 시 0 records 버그 수정

### 원인
ScheduleCell의 막대 카운팅 로직 vs SubtestList 필터 의미가 불일치:

| | Plan 막대 카운트 (ScheduleMatrix) | SubtestList 필터 (현재) |
|---|---|---|
| Plan(회색) | `*_planned_date`가 bucket 내 → **status 무관** | `cell_status=Planned` 강제 → status≠Planned 모두 제외 |
| Actual(파랑/주황) | `*_actual_date`가 bucket 내 (status=Done인 경우만 actual_date 존재) | `cell_status=Done` 강제 (사실상 무해) |

DB 확인 결과: AHU System L13-26 South Office, t1_planned_date=2026-04-19 인 subtest가 15개 존재하지만 모두 `t1_status=NULL` → `cell_status=Planned` 조건에 걸려 0 records.

### 수정 방안
`SchedulePage.handleCellClick`에서 **plan 클릭 시 `cell_status` 파라미터를 보내지 않음**. Actual 클릭 시에만 `cell_status=Done` 유지(actual_date가 있다는 것 자체가 거의 Done을 의미하므로 안전).

또한 `SubtestList`의 schedule cell 필터 로직도 `urlCellStatus`가 없을 때 status 체크를 건너뛰도록 이미 되어있으므로 추가 수정 불필요. (462-478라인은 cell_status가 있을 때만 status 체크)

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/pages/SchedulePage.tsx` | `handleCellClick`에서 `field === 'planned'`일 때 `cell_status` 파라미터 생성 안 함. Actual일 때만 `cell_status=Done` 유지 |

### Active filter chip 표시
Plan 클릭 시 `cell_status` 미설정 → chip은 "Planned 2026-04-19" 형식만 남고 "Cell Status Planned" chip 사라짐. 사용자에게는 "이 날짜에 plan된 모든 subtest" 의미가 더 정확.

### 검증
1. AHU System L13-26 South Office의 T1 plan 막대(2026-04-19) 클릭 → 15개 subtest 표시 (status 무관)
2. Actual 막대 클릭 → 종전대로 status=Done인 subtest만 표시
3. Day/Week 모드, Pred/T1/T2 stage 모두에서 plan 클릭이 status에 무관하게 결과 반환

