
## 구현 계획: Defect Import에 Data Date 및 Team 입력 기능 추가

Defect Management의 Import UI를 T&C Management Import와 동일한 사용 흐름으로 맞추겠습니다.

```text
현재 Defect Import
- 파일 업로드
- 파싱 결과 표시
- Execute Import

추가 구현 후
- 파일 업로드
- 파일별 Data Date 입력
- 파일별 Team 선택
- Execute Import
- 선택한 Data Date / Team을 Import batch 및 defect item에 반영
```

## 1. Defect Import 파일 상태 확장

`src/pages/DefectImportPage.tsx`의 파일 상태 타입에 아래 값을 추가합니다.

```text
dataDate
team
```

기본값은 T&C Import와 동일하게 처리합니다.

```text
dataDate = 오늘 날짜
team = 빈 값
```

## 2. UI 추가

각 선택 파일 카드 안에 T&C Import와 같은 입력 영역을 추가합니다.

```text
Data Date: [date input]
Team:      [Mechanical / Electrical / Architecture / Support select]
```

사용 규칙:

```text
- Import 실행 중에는 입력 비활성화
- 완료/실패된 파일은 입력 비활성화
- Team 선택지는 기존 공통 enum 사용
  - Mech = Mechanical
  - Elec = Electrical
  - Arch = Architecture
  - Supp = Support
```

## 3. Ready Count 및 실행 조건 조정

Defect Import에서도 파일별 Team을 필수로 두겠습니다.

```text
readyCount = status가 ready이고 team이 선택된 파일 수
```

Team 미선택 파일은 Execute Import 대상에서 제외되며, UI에는 선택이 필요하다는 안내를 표시합니다.

```text
Team is required before import.
```

## 4. Import Batch에 Data Date 저장

`defect_upload_batches` 테이블에는 이미 `data_date` 컬럼이 있으므로 DB schema 변경은 필요 없습니다.

Import batch 생성 시 아래처럼 저장합니다.

```text
data_date = file.dataDate
```

## 5. Defect Item에 Team 반영

Import row에 Excel에서 파싱된 Team이 있더라도, 파일 카드에서 선택한 Team을 우선 적용합니다.

```text
defect_items.team = selected file team
```

적용 방식:

```text
1. 파일별 Team 선택값이 있으면 그 값을 사용
2. 선택값이 없을 경우 기존 Excel parser의 row.team 사용
3. 둘 다 없으면 null
```

다만 UI에서 Team을 필수로 만들 예정이므로 실제 Import에서는 대부분 선택 Team이 저장됩니다.

## 6. Insert / Update 모두 반영

신규 Defect 항목 생성 시:

```text
team = selected file team
source_upload_id = upload batch id
data_source_type = defect_import
```

기존 Defect 항목 업데이트 시:

```text
team = selected file team
source_upload_id = upload batch id
data_source_type = defect_import
row_version 증가
```

즉, 같은 Issue No를 재import해도 선택한 Team이 반영됩니다.

## 7. Daily Snapshot 및 Schedule Revision 연계

기존 로직을 유지하면서 선택한 Data Date를 snapshot 기준일로 사용하도록 보강합니다.

```text
defect_daily_snapshots.snapshot_date = file.dataDate 또는 오늘 날짜
```

Schedule Revision audit은 기존처럼 변경이 발생한 경우 기록하되, `created_at`은 시스템 시간으로 유지합니다.

## 8. Import Summary 및 Logs 영향

Import Summary는 현재 구조를 유지합니다.

```text
Inserted
Updated
Skipped
Rejected
```

Import Logs에서는 `defect_upload_batches.data_date`가 저장되므로, 이후 필요 시 로그 화면에서 Data Date 표시도 확장할 수 있습니다.

이번 구현 범위에는 우선 Import 저장까지 포함하고, 로그 화면 컬럼 확장은 별도 요청 시 진행합니다.

## 9. 수정 대상 파일

```text
src/pages/DefectImportPage.tsx
```

DB schema 변경은 필요 없습니다.

```text
defect_upload_batches.data_date 이미 존재
defect_items.team 이미 존재
defect_daily_snapshots.snapshot_date 이미 존재
```

## 10. 검증 항목

```text
1. Defect Import 파일 카드에 Data Date 입력이 표시됨
2. Defect Import 파일 카드에 Team 선택이 표시됨
3. 기본 Data Date가 오늘 날짜로 설정됨
4. Team 미선택 시 Execute Import 대상에서 제외됨
5. Team 선택 후 Execute Import 버튼 count가 증가함
6. Import batch에 data_date가 저장됨
7. 신규 defect_items.team에 선택 Team이 저장됨
8. 기존 Issue No 업데이트 시 team도 선택 Team으로 갱신됨
9. daily snapshot의 snapshot_date에 Data Date가 반영됨
10. 기존 Import Summary 및 progress UI가 유지됨
11. T&C Import UI와 Defect Import UI의 사용 방식이 일치함
```
