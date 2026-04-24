

## Defect ↔ T&C 팀 라벨 통일

### 현황

```text
DB enum (team_type): 'Mech' | 'Elec' | 'Arch' | 'Supp'
profiles.team:        Mech, Elec, Arch, Supp  (enum)
subtests.team:        Mech, Elec, Arch, Supp  (enum)
defect_items.team:    Mech, Elec, Arch, Supp  (enum)
TEAM_LABELS:          Mech→Mechanical, Elec→Electrical, Arch→Architectural, Supp→Support

권한 로직 (get_defect_edit_scope, get_subtest_edit_scope):
  → 이미 enum 그대로 비교 → 'Elec' senior_user 는 defect.team='Elec' 항목 'team' scope 부여 (정상 동작)

읽기 RLS:
  → defect_items SELECT = true (모든 인증 사용자 읽기 가능)

문제는 표시 일관성:
  - SubtestList:  "Mechanical" (TEAM_LABELS 적용)
  - DefectRawDataPage:  "Mech" (raw enum 표시)
  - DefectProgressMatrix / Detail / ScheduleRevision / Export:  "Mech" (raw enum)
  → 사용자는 두 시스템이 별개 팀처럼 보여 혼동

권한은 이미 통일되어 있으므로, 이번 변경은 "표시 라벨 통일"에 집중.
```

### 변경 범위

**1. 모든 Defect 페이지에서 team 표시를 `TEAM_LABELS` 적용**

| 파일 | 변경 |
|---|---|
| `src/pages/DefectRawDataPage.tsx` | team 컬럼 cell 렌더에 `TEAM_LABELS[v]` 적용; team 필터 multi-select 옵션 라벨도 풀네임; 활성 필터 칩 표시도 풀네임 |
| `src/pages/DefectDetailPage.tsx` | team Field 렌더링/편집 옵션에 풀네임 라벨 (값은 enum 유지) |
| `src/pages/DefectProgressPage.tsx` & `src/components/defects/DefectProgressMatrix.tsx` | groupBy='team' 일 때 행 라벨을 `TEAM_LABELS` 적용 |
| `src/pages/DefectScheduleRevisionPage.tsx` | team 컬럼 표시 풀네임 |
| `src/pages/DefectExportPage.tsx` & `src/lib/defect-export-utils.ts`, `defect-dashboard-excel-export.ts` | Excel export 시 team 셀에 풀네임으로 변환 (선택; 데이터 호환성 위해 옵션) |

**2. DefectDashboardPage**
- 이미 `TEAM_LABELS` 적용 중. 변경 불필요. 단 `byTeam` 집계의 row.label 도 이미 enum 값 → 표시 시 `TEAM_LABELS[label] ?? label` 폴백 적용해 풀네임 표시.

**3. 권한 측면 — 변경 없음 (이미 정상)**
- DB 함수 `get_defect_edit_scope`, `get_subtest_edit_scope` 모두 enum 일치로 팀 매칭 중.
- profiles.team='Elec' 인 senior_user 는 defect_items.team='Elec' 항목들에 'team' scope 부여됨.
- 이번 변경은 SQL 마이그레이션 없음.

**4. URL 쿼리 호환**
- `?team=Mech` 같은 URL 파라미터는 enum 값 그대로 유지 (외부 링크/북마크 호환).
- 다만 사용자가 풀네임으로 검색하면 일치 안 함 → 라벨 매칭 시 `normalizeTeamValue` 사용해 양방향 허용 (이미 `enums.ts` 에 존재).

**5. Helper 한 군데로 모음**
- `src/types/enums.ts` 에 `formatTeamLabel(value: string | null | undefined): string` 추가:
  ```text
  null/empty → '—'
  enum 값 (Mech) → TEAM_LABELS[v]
  풀네임 ('Mechanical') → 그대로
  알 수 없는 값 → 원본 그대로
  ```
- 모든 Defect 페이지에서 이 헬퍼 사용 → 일관성 확보.

### 변경하지 않는 항목

- DB 스키마, RLS, 함수 (이미 정상)
- T&C(SubtestList) 측 — 이미 풀네임 표시
- Import 로직 — `normalizeTeamValue` 가 이미 'Mechanical'/'Mech' 모두 'Mech' 로 정규화
- defect_items 의 저장값 — enum 유지

### 검증

```text
1. profiles.team='Elec' senior_user 로 로그인
   → /defects/raw-data 진입 → team 컬럼이 "Electrical" 로 표시됨
   → /tc/raw-data 의 Electrical 행과 동일 라벨

2. team 필터 드롭다운에 "Mechanical / Electrical / Architectural / Support" 표시

3. defect 행 더블클릭 → 편집 가능 (이미 'team' scope 정상 부여)

4. URL ?team=Mech 접근 시 필터 정상 적용 + UI 는 "Mechanical" 표시

5. Dashboard By Team 탭 → "Mechanical / Electrical / ..." 행 표시

6. Schedule Revision / Detail / Progress 페이지에서도 team 컬럼이 풀네임

7. Excel export 시 team 컬럼이 풀네임으로 출력 (가독성)
```

