

## 추가 반영 목표

Defect Management에도 T&C Management와 동일한 개념의 `Schedule Revision` 탭을 추가합니다.

즉, Defect Import 또는 Detail/Quick Update에서 일정 관련 값이 변경될 때 변경 이력을 별도로 추적하고, 화면에서 변경 전/후 일정, 변경 일수, 변경 사유/영향을 확인할 수 있도록 구성합니다.

```text
T&C Management
- Schedule Revision

Defect Management
- Schedule Revision
```

---

## 최종 메뉴 구조

### T&C Management

```text
Dashboard
Progress
Schedule Revision
Raw Data
Import
Import Logs
Export
Quick Update
```

### Defect Management

```text
Dashboard
Progress
Schedule Revision
Raw Data
Import
Import Logs
Export
Quick Update
```

### Administration

```text
Admin
```

Defect 신규 라우트는 아래를 추가합니다.

```text
/defects/schedule-revision
```

기존 T&C 라우트는 새 구조로 유지/redirect합니다.

```text
/schedule/revision → /tc/schedule-revision
```

---

## Defect Schedule Revision의 목적

Defect Management에서는 T&C의 Pred/T1/T2 일정 변경 대신, Defect 항목의 주요 일정 및 종결 관련 변경을 추적합니다.

주요 추적 대상은 다음과 같습니다.

```text
Planned Date
Target Date
Closed Date
Closure Status
Actual Progress %
```

특히 계획일 변경, 종결 예정일 변경, 실제 종결일 입력/변경, 진행률 변화가 Import 또는 수동 입력으로 발생했을 때 별도 revision log에 기록합니다.

---

## Defect Schedule Revision 화면 구성

기본 화면은 T&C `Schedule Revision`과 유사한 테이블 형태로 구성합니다.

기본 표시 컬럼:

```text
Issue No
Subcontractor Issue No
Type
Level
Location
Main Trade
Sub Trade
Team
Subcontractor
Sub-Sub
HDEC PIC
Changed At
Changed By
Change Source
```

일정/진도 변경 컬럼:

```text
Planned Date
- Old Date
- New Date
- Diff Days

Target Date
- Old Date
- New Date
- Diff Days

Closed Date
- Old Date
- New Date
- Diff Days

Actual Progress %
- Old %
- New %
- Diff %

Closure Status
- Old Status
- New Status
```

헤더에는 T&C Schedule Revision과 동일한 정렬/필터 로직을 적용합니다.

```text
1. Header click sorting
2. Text filter
3. Date range filter
4. Multi-select filter
5. Clear filters
6. Clear sort
7. Row click → Defect Detail 이동
```

---

## Defect Schedule Revision 데이터 구조

Defect 전용 일정 변경 audit table을 추가합니다.

### defect_schedule_change_audit

```text
id
upload_id
defect_id
project_id

issue_no
subcontractor_issue_no

raw_row_no

planned_old_date
planned_new_date
planned_diff_days

target_old_date
target_new_date
target_diff_days

closed_old_date
closed_new_date
closed_diff_days

progress_old_pct
progress_new_pct
progress_diff_pct

closure_status_old
closure_status_new

created_by
created_at
change_source
```

연결 및 조회 편의를 위해 `issue_no`는 audit table에도 저장합니다.

다만 실제 상세 이동은 `defect_id` 기준으로 처리합니다.

---

## Import 시 Revision 기록

Defect Import는 `Issue No` 기준으로 upsert합니다.

Import 중 기존 defect item과 신규 row를 비교하여 아래 필드가 변경되면 `defect_schedule_change_audit`에 기록합니다.

```text
planned_date
target_date
closed_date
actual_progress_pct
closure_status
```

처리 방식:

```text
Issue No 신규 → defect_items insert
Issue No 기존 + 일정/진도 변경 있음 → defect_items update + revision audit insert
Issue No 기존 + 변경 없음 → skipped
Issue No 없음 → rejected
```

T&C Schedule Revision처럼 일정 변경사항만 따로 모아 조회할 수 있도록, 일반 change log와 별도로 schedule revision audit을 유지합니다.

---

## 수동 수정 시 Revision 기록

Defect Detail 또는 Defect Quick Update에서 아래 값이 변경될 때도 동일하게 revision audit을 생성합니다.

```text
planned_date
target_date
closed_date
actual_progress_pct
closure_status
```

변경 경로는 `change_source`로 구분합니다.

```text
import
app_direct_input
quick_update
```

일반 필드 변경 이력은 기존 계획의 `defect_change_log`에 기록하고, 일정/진도/종결 관련 변경은 추가로 `defect_schedule_change_audit`에도 기록합니다.

---

## Area 및 Header 처리 유지

이전 수정사항은 그대로 유지합니다.

### Area 분리

Excel의 `Area` 값은 아래처럼 저장합니다.

```text
area_raw
area_type
area_level
area_location
```

예시:

```text
Area:
Shaw Tower Redevelopment > STR > Level 07 > Riser - ELV/ICN

area_type     = STR
area_level    = Level 07
area_location = Riser - ELV/ICN
```

### Header 표시

Excel header에 `(H)`가 있어도 앱 화면에서는 제거해서 표시합니다.

```text
Excel: Planned Date (H)
App:   Planned Date
```

내부적으로는 향후 자동화 대비 `original_header`, `display_name`, `source_origin`만 보관합니다.

일반 사용자 화면에는 `(H)`, `LL original`, `HDEC-added` 같은 구분 문구를 노출하지 않습니다.

---

## Defect DB 최종 구성

Defect Management에는 아래 테이블을 추가합니다.

```text
defect_items
defect_field_config
defect_upload_batches
defect_upload_row_logs
defect_change_log
defect_daily_snapshots
defect_schedule_change_audit
```

핵심 기준:

```text
1. Issue No = Defect item unique key
2. Subcontractor Issue No = 향후 Subcontractor별 자체 번호 연동용
3. Area = Type / Level / Location으로 분리 저장
4. raw_payload = Excel 원본 row 보존
5. Schedule Revision = 일정/진도/종결 변경 이력 전용 audit
```

---

## 권한 정책

T&C에서 적용한 2단계 권한 구조를 Defect에도 동일하게 적용합니다.

### 담당자 기반 권한

아래 중 하나가 일치하면 저장 권한을 부여합니다.

```text
profile.hdec_pic_name = defect_items.hdec_pic_name
profile.subcontractor_name = defect_items.subcontractor_name
profile.subsub_name = defect_items.subsub_name
```

담당자 기반 사용자는 진행/상태/종결 관련 필드를 수정할 수 있습니다.

```text
actual_progress_pct
closure_status
closed_date
remarks
hdec_comments
```

책임자명은 변경할 수 없습니다.

```text
subcontractor_name
subsub_name
hdec_pic_name
```

### Senior User 권한

Senior User는 본인 소속 Team의 Defect item을 수정/저장할 수 있습니다.

```text
profile.team = defect_items.team
```

Senior User는 소속 Team 내 책임자명 변경도 가능합니다.

### Admin / Superuser 권한

기존처럼 전체 관리 권한을 유지합니다.

```text
전체 조회
전체 수정
전체 삭제
책임자명 변경
Import 관리
Field Config 관리
```

---

## 단계별 구현 계획

### Phase 1. 메뉴/라우트 구조 개편

```text
1. Sidebar를 T&C Management / Defect Management / Administration으로 재구성
2. 기존 T&C route를 /tc/*로 이동
3. 기존 route는 새 route로 redirect
4. Defect Management route 추가
5. Defect Schedule Revision route 추가
6. Breadcrumb/page title에 섹션 구분 반영
```

### Phase 2. Defect DB 및 권한 기반 구축

```text
1. defect_items 생성
2. defect_field_config 생성
3. defect_upload_batches 생성
4. defect_upload_row_logs 생성
5. defect_change_log 생성
6. defect_daily_snapshots 생성
7. defect_schedule_change_audit 생성
8. Issue No unique 기준 설정
9. Area 분리 컬럼 추가
10. Subcontractor 자체 번호 확장 컬럼 추가
11. Defect RLS 정책 추가
12. get_defect_edit_scope / can_update_defect 함수 추가
13. 책임자명 변경 방지 trigger 추가
```

### Phase 3. Defect Import 구현

```text
1. 업로드 Excel header 분석
2. "(H)" 포함 header의 내부 source_origin 저장
3. 앱 표시용 display_name에서는 "(H)" 제거
4. Issue No 기준 upsert 구현
5. Area → Type / Level / Location 파싱 구현
6. raw_payload에 원본 row 보존
7. 일정/진도/종결 변경 비교 로직 구현
8. defect_schedule_change_audit 기록
9. Import summary 구현
10. Import row log 구현
11. 일반 change log 기록
12. Daily snapshot 생성
```

### Phase 4. Defect Raw Data / Detail / Quick Update

```text
1. Defect Raw Data 테이블 구현
2. Type / Level / Location 컬럼 표시
3. 정렬/필터/검색 구현
4. Defect Field Config 연동
5. Defect Detail 화면 구현
6. 권한에 따른 Save 표시/미표시
7. assigned 권한자의 책임자명 field 비활성화
8. Senior User 팀 권한 적용
9. 일정/진도/종결 변경 시 Schedule Revision audit 기록
10. Defect Quick Update 구현
```

### Phase 5. Defect Schedule Revision

```text
1. /defects/schedule-revision 페이지 생성
2. defect_schedule_change_audit 조회
3. defect_items metadata와 연결
4. Issue No / Type / Level / Location / 담당자 정보 표시
5. Planned Date 변경 표시
6. Target Date 변경 표시
7. Closed Date 변경 표시
8. Actual Progress % 변경 표시
9. Closure Status 변경 표시
10. Header sorting/filter 구현
11. Clear filters / Clear sort 구현
12. Row click → Defect Detail 이동
```

### Phase 6. Defect Dashboard / Progress

```text
1. Defect Dashboard KPI 구현
2. Type / Level / Location별 집계 구현
3. Main Trade / Sub Trade / Team / 담당자별 집계 구현
4. 계획 대비 실제 진도율 구현
5. 누계 계획 / 누계 실적 구현
6. 일일 실적 구현
7. Overdue / Due Soon / Closed trend 구현
8. Dashboard에서 Raw Data drill-down 연결
```

### Phase 7. Export / Admin / Audit 완성

```text
1. Defect Export 구현
2. Defect Schedule Revision export 구현
3. Defect Field Config Admin 구현
4. Defect change log 조회
5. Backup & Restore 범위에 Defect data 포함
6. Audit Logs에서 T&C / Defect 구분 표시
7. Subcontractor Issue No 관리 기능 추가
```

---

## 1차 구현 범위 제안

먼저 아래 범위까지 구현하는 것을 권장합니다.

```text
1. 메뉴/라우트 구조 개편
2. Defect DB schema + 권한 구조
3. Defect Excel Import
4. Issue No 기준 upsert
5. Area → Type / Level / Location 분리
6. "(H)" 제거 표시명 처리
7. Defect Raw Data
8. Defect Detail
9. Defect Schedule Revision
10. 기본 Dashboard KPI
```

이후 2차로 고도화합니다.

```text
1. Progress matrix
2. Daily / cumulative chart
3. Subcontractor Issue No 관리
4. Advanced export
5. Admin Field Config 고도화
6. LL 원본파일 자동 비교 기능
```

---

## 검증 항목

```text
1. 기존 T&C 기능이 T&C Management 섹션에서 정상 동작
2. 기존 URL 접속 시 새 T&C URL로 redirect
3. Defect Management 메뉴가 권한에 맞게 표시
4. Defect Schedule Revision 메뉴가 표시됨
5. Defect Import에서 Issue No가 고유 key로 사용됨
6. Issue No가 없는 row는 rejected 처리
7. 동일 Issue No 재import 시 update 처리
8. Area 값이 Type / Level / Location으로 분리 저장됨
9. "(H)" header는 화면에 "(H)" 없이 표시됨
10. raw_payload에는 원본 header와 값이 보존됨
11. Planned Date 변경 시 Defect Schedule Revision에 기록됨
12. Target Date 변경 시 Defect Schedule Revision에 기록됨
13. Closed Date 변경 시 Defect Schedule Revision에 기록됨
14. Actual Progress % 변경 시 Defect Schedule Revision에 기록됨
15. Closure Status 변경 시 Defect Schedule Revision에 기록됨
16. Defect Schedule Revision에서 정렬/필터가 동작함
17. Defect Schedule Revision 행 클릭 시 Defect Detail로 이동함
18. Defect Detail Save 버튼이 권한 있을 때만 표시됨
19. 담당자 기반 사용자는 책임자명 변경 불가
20. Senior User는 본인 Team 항목의 책임자명 변경 가능
21. Admin / Superuser는 전체 관리 가능
22. Dashboard KPI와 Raw Data count가 일치
```

