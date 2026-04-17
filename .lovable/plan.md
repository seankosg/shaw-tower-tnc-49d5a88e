

## Dashboard 재디자인 — 최종 플랜 (At-Risk 임계값 반영)

### 핵심 컨셉
**"Plan vs Actual, drill from big to small"** — 프로젝트 전체 → System / Subcontractor / Sub-Sub / HDEC PIC → Subtest 상세까지 파고드는 대시보드. 지연 경고가 항상 최상단.

### 데이터 모델 활용
- **Test 단위 완료 판정**: `(project_id, system_id, item_no)` 그룹 내 모든 subtest의 T2가 Done이면 Test 완료
- **지연 분류** (Admin에서 임계값 설정 가능, default 2일):
  - 🔴 **Overdue**: 계획일 < 오늘 & 미완료
  - 🟡 **At-Risk**: 계획일까지 ≤ N일 (default 2일) & 미완료
  - 즉, 3일 이상 남은 건은 정상

---

### 레이아웃 (Top → Bottom)

#### 1. Top KPI Strip (8개 카드, 2행 × 4열)
Total Tests / Tests Done / Tests in Progress / Tests Not Started  
Total Subtests / T1 Done % / T2 Done % / Overdue Count (빨강)
- 카드 클릭 → SubtestList로 해당 필터 적용 이동

#### 2. Alert Banner — Overdue & At-Risk
- 🔴 **Overdue** 건수 + "View"
- 🟡 **At-Risk (≤2일)** 건수 + "View"

#### 3. Plan vs Actual — S-Curve (전체 폭)
**시간 단위 토글: Daily / Weekly**
- 4개 라인: T1 Planned (점선), T1 Actual (실선), T2 Planned (점선), T2 Actual (실선)
- 오늘 날짜 세로선 표시

#### 4. 4개 탭: System / Subcontractor / Sub-Sub / HDEC PIC
| 그룹명 | Total Tests | Done | In Progress | Not Started | Overdue | T1 % | T2 % | Progress |

- 행 클릭 → SubtestList로 해당 그룹 필터 이동
- 기본 정렬: Overdue 많은 순
- Sub-Sub 탭: NULL은 "(None)" 그룹

#### 5. 하단 2분할
**왼쪽**: Top 10 Overdue Subtests (지연일수 표시) → 행 클릭 시 SubtestDetail  
**오른쪽**: Status Distribution 도넛 2개 (T1 / T2) — 세그먼트 클릭 시 SubtestList 필터

---

### Subtest 연동 (Drill-Down)
SubtestList가 `useSearchParams`로 URL query param 필터 수신:
- `?system=` / `?subcon=` / `?subsub=` / `?hdec_pic=`
- `?status=overdue` / `?status=at_risk`
- `?t1_status=` / `?t2_status=`

---

### At-Risk 임계값 — Admin 설정

**저장 방식**: 신규 테이블 `app_settings` (key/value)
```sql
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
-- RLS: 모두 SELECT 가능, admin/superuser만 UPDATE
-- Seed: ('at_risk_threshold_days', '2'::jsonb)
```

**Admin UI**: AdminPage.tsx에 신규 **Settings** 탭 추가
- "At-Risk Threshold (days)" number input (1~30 범위)
- "현재 ≤ N일 남은 미완료 건을 At-Risk로 표시" 설명
- Save 버튼 → toast

**대시보드 사용**: 마운트 시 `app_settings`에서 `at_risk_threshold_days` fetch → 분류 로직에 반영. 변경 시 dashboard 새로고침으로 반영.

---

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/pages/DashboardPage.tsx` | 전면 재작성: KPI strip, Alert banner, S-curve(Daily/Weekly), 4-tab breakdown, 하단 split |
| `src/pages/SubtestList.tsx` | URL query param 필터 수신 (system/subcon/subsub/hdec_pic/status/t1_status/t2_status) |
| `src/pages/AdminPage.tsx` | Settings 탭 추가 (At-Risk 임계값 input) |
| `src/lib/dashboard-utils.ts` (신규) | Test 완료 판정, overdue/at-risk 분류, S-curve 일/주 단위 aggregation, 4종 그룹별 집계 |
| `src/hooks/useAppSettings.ts` (신규) | `at_risk_threshold_days` fetch/update 훅 |
| Migration | `app_settings` 테이블 생성 + RLS + seed |

Edge function 변경 없음. recharts 기존 그대로.

