

## T1/T2 Schedule 반영 점검 결과

### 결론: T1/T2는 **이미 정규 필드 기반**으로 동작하지만, 미세한 이슈 1개 존재

`schedule-utils.ts`의 `getStageDates()` 검토:

```typescript
if (stage === 't1') {
  return {
    plan: s.t1_planned_date,
    actual: s.t1_status === 'Done' ? s.t1_actual_date : null,
    done: s.t1_status === 'Done',
  };
}
if (stage === 't2') {
  return {
    plan: s.t2_planned_date,
    actual: s.t2_status === 'Done' ? s.t2_actual_date : null,
    done: s.t2_status === 'Done',
  };
}
```

T1/T2는 DB 정규 필드(`t1_status`, `t1_planned_date`, `t1_actual_date`, T2 동일)를 직접 읽으므로 **추론 없음**. 이전 백필로 Done 항목 376건의 actual_date도 채워졌음 → Master DB와 일치.

---

### 발견된 이슈 (미세)

#### 이슈 1: actual은 status='Done'일 때만 카운트 → WIP 진행 중 항목 누락
- 현재: `actual = (status === 'Done') ? actual_date : null`
- 즉 status='WIP'이고 actual_date가 있어도 Schedule actual에 안 잡힘
- **영향**: WIP는 시작은 했지만 미완료 → "Cum Actual" 정의를 "완료 누적"으로 본다면 현재 로직이 맞음. "착수 누적"으로 본다면 수정 필요.
- **판단 필요**: Cum Actual = "완료 기준" 유지 vs "착수 포함"?

#### 이슈 2: actual_date가 없는 Done 항목 (cutoff 이후 12건)
- 이전 백필에서 `t1_planned_date > 2026-04-19`인 12개 T1 Done 항목은 제외됨
- → Schedule에서 이 12건은 done count에는 잡히지만 actual 버킷에는 안 그려짐
- **권장**: 이번 작업에 같이 백필 (planned_date 그대로 사용)

#### 이슈 3: T2 done인데 T1 데이터 없는 경우 가능성
- 현재 로직은 T1/T2 독립 처리이므로 문제 없음
- 단, KPI/progress 표시에서 stage 순서 가정이 깨질 수 있음 → 별도 점검

---

### 종합 계획 (Predecessor + T1/T2 보완)

#### 1. Predecessor 정규화 (앞선 계획 그대로)
- DB: `pred_status`, `pred_planned_date`, `pred_actual_date` 컬럼 추가
- 백필: `predecessor_status_raw` 파싱
- Import/수동편집/Schedule/Dashboard/StageProgress 모두 정규 필드 사용
- Schedule의 pred 추론 로직 완전 제거

#### 2. T1/T2 보완
- **2-1. Cutoff 이후 Done 12건 백필**: `t1_planned_date > 2026-04-19`이고 status='Done'인 12개 행도 `t1_actual_date = t1_planned_date`로 채움 (T2 동일 점검)
- **2-2. Cum Actual 정책 확정**: "완료 기준" 유지 (현재 로직 그대로) — 변경 불필요
  - 만약 사용자가 "착수 포함"을 원하면 `actual = (status==='Done' || status==='WIP') ? actual_date : null`로 수정 가능 (옵션)

#### 3. 검증
- AHU System L13-26 South Office에서:
  - Master DB pred Done 수 = Schedule Pred Done 수
  - Master DB T1 Done 수 = Schedule T1 Done 수
  - Master DB T2 Done 수 = Schedule T2 Done 수
  - 각 stage별 Cum Actual = `*_actual_date` NOT NULL 카운트
- Excel 재import 후 모든 화면 즉시 일관

---

### 변경 파일 (최종)

| 파일 | 변경 |
|---|---|
| DB migration | pred 3개 컬럼 추가 + pred 백필 + cutoff-after T1/T2 백필 + change_log |
| `src/lib/import-parser.ts` | normalizePredecessor 확장, ParsedSubtest 필드 추가 |
| `src/contexts/ImportContext.tsx` | pred 3개 필드 upsert + actual_date 자동 채움 |
| `src/pages/SubtestDetail.tsx` | Pred 편집 UI + 가드 |
| `src/pages/MobileUpdatePage.tsx` | Pred 편집 UI + 가드 |
| `src/lib/schedule-utils.ts` | pred 추론 제거, 정규 필드 직접 사용 |
| `src/lib/dashboard-utils.ts` | 동일 |
| `src/components/shared/StageProgress.tsx` | 정규 필드 우선 |
| `src/pages/SchedulePage.tsx`, `DashboardPage.tsx` | SELECT에 pred 필드 추가 |
| `src/lib/schedule-cache.ts`, `subtest-cache.ts` | 새 필드 포함 |

### 비변경
Excel 템플릿 / RLS / Subtest List 컬럼 구성 / T1·T2 표시 로직(이미 정상)

