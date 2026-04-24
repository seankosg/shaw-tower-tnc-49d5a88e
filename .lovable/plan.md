

## Admin Settings 에 Frozen 컬럼 수 옵션 추가

### 변경 개요

Raw Data 의 frozen(좌측 고정) 컬럼 수를 Admin → Settings 에서 1~4 중 선택. 컬럼 순서는 Field Config 기준이고, 첫 번째는 항상 `issue_no` 로 고정.

### 변경 내용

**1. Admin Settings 에 옵션 추가** (`src/pages/AdminPage.tsx` — `SettingsTab`)

기존 At-Risk 임계일수 옆에 새 항목:
```text
Frozen Columns (Raw Data):  [ 1 | 2 | 3 | 4 ]   기본값 1
설명: "Number of left-fixed columns in Raw Data tables.
       Issue No is always the first frozen column."
```
- 저장은 기존 `app_settings` 테이블 활용 (key=`raw_data_frozen_columns`, value=number)
- DB 마이그레이션 불필요

**2. 새 훅** (`src/hooks/useAppSettings.ts`)

`useAtRiskThreshold` 옆에:
```text
export function useFrozenColumnCount() {
  return useAppSetting<number>('raw_data_frozen_columns', 1);
}
```

**3. 컬럼 순서/Frozen 적용** (`src/pages/DefectRawDataPage.tsx`)

- `columnOrder` 변경: `issue_no` 만 강제 첫 번째, 나머지는 Field Config `sort_order` 순:
  ```text
  ['issue_no', ...sortFieldNames(allIds.filter(id => id !== 'issue_no' && isFieldVisible(id)))]
  ```
- `frozenCount`: 기존 하드코드(`isMobile ? 1 : 4`) 제거 → Admin 설정값 사용:
  ```text
  const { value: frozenSetting } = useFrozenColumnCount();
  const frozenCount = isMobile ? 1 : Math.min(Math.max(frozenSetting, 1), 4);
  ```
- 결과: frozen pane 에는 columnOrder 의 앞 N 개(=Issue No + Field Config 순서대로 다음 N-1 개) 가 자동으로 들어감
- 모바일은 항상 1 (기존 동작 유지)

**4. T&C SubtestList 동일 적용 여부**

이번 범위는 Defect Raw Data 만. SubtestList 는 별도 frozen 동작 → 같은 설정을 공유할지는 후속 결정 사안. 이번 작업에서는 건드리지 않음.

### 변경하지 않는 항목

- DB 스키마, Field Config UI, RLS, 권한
- 다른 Defect 페이지 (Detail/Progress/Export/Dashboard)
- 정렬/필터/검색/리사이즈/virtualization/localStorage
- T&C 측 SubtestList

### 동작 시나리오

```text
1. 신규 사용자 (설정 없음): frozen=1 → Issue No 만 고정
2. Admin 에서 Frozen=3 으로 저장:
   → Field Config 순서가 [issue_no, team, closure_status, status, ...] 라면
   → 좌측에 Issue No / Team / Closure Status 3개 고정, 나머지 스크롤
3. Admin 에서 Field Config 의 'team' sort_order 를 뒤로 옮김:
   → Frozen=3 일 때 좌측에 Issue No / (다음 순서 컬럼) / (그 다음) 자동 반영
4. Field Config 에서 frozen 영역에 들어갈 컬럼을 disable:
   → 그 컬럼 사라지고, frozen pane 의 다음 컬럼이 끌려와 N 개 유지
5. 모바일: 설정 무관 항상 1
6. 설정 변경 직후 Raw Data 재진입 시 즉시 반영
```

### 검증 체크리스트

```text
[ ] Admin → Settings 에 "Frozen Columns" 1~4 셀렉터 표시 + 저장
[ ] app_settings 에 key='raw_data_frozen_columns' 행 upsert 됨
[ ] Defect Raw Data: 기본 1개 frozen, Issue No 고정
[ ] 설정 2/3/4 변경 시 좌측 고정 영역 폭이 그에 맞게 늘어남
[ ] columnOrder = [issue_no, ...Field Config 순서] 로 정상 정렬
[ ] Field Config 토글이 즉시 표에 반영, frozen 개수 일정 유지
[ ] 모바일 뷰포트에서는 항상 1개 frozen
[ ] 가로 스크롤 시 frozen pane 이 함께 따라옴
```

