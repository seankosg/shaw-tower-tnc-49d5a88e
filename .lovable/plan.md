# Captured By 데이터 노출 + 그룹 분류

## 현상

대시보드 Captured By 섹션에 "No Captured By data available" 표시. 또한 인물별 카드를 Arch / Facade / MEP 3개 그룹으로 분리 필요.

## 원인 진단

DB에는 905명분 `captured_by_name` 백필 완료 (Mech 23, Arch 656, Elec 226). 그러나 `src/lib/defect-cache.ts`의 `SLIM_COLUMNS` 배열에 `captured_by_name`이 누락되어 클라이언트가 fetch하지 않음.

## 작업

### 1) 캐시 select에 컬럼 추가

`src/lib/defect-cache.ts` `SLIM_COLUMNS`에 `'captured_by_name'` 추가 (`hdec_eng_name` 다음).

### 2) Captured By 그룹 매핑 정의

`src/lib/captured-by-groups.ts` 신규 파일:

```text
Arch:
  Penn Theen, Theepa Vishali Kanisan, Kuan Wei Wong, Nick Cranney,
  Mani Kamalabathan, Mohammad Hossain, Rasyid Suwandi, Minxian Lee,
  Chin Siong Lim
  (alias 'Imam' 포함 — 부분일치)

Facade:
  Merlin Sesaiyan, Lawrence Lau

MEP:
  Sahari Bin Sam, Derrick Tan, Boon Ken Lau (=Beca Boon),
  Audrey Chin (=Beca Chin)
  (alias 'Beca' 단독 — 부분일치)
```

구현은 그룹별 키워드 리스트(소문자/공백 정규화)와 정확 매칭 우선, 부분 매칭 fallback. 어느 그룹에도 매칭되지 않으면 `Other` 그룹으로 분류.

함수 시그니처:
- `getCapturedByGroup(name: string | null): 'Arch' | 'Facade' | 'MEP' | 'Other' | null`
- `CAPTURED_BY_GROUPS: readonly ['Arch', 'Facade', 'MEP', 'Other']`

### 3) Dashboard UI 그룹 분리

`DefectDashboardPage.tsx`의 `CapturedByStatsSection` 수정:

- 인물별 stats 산출 후 그룹별로 버킷팅
- 그룹 순서: Arch → Facade → MEP → Other (빈 그룹은 미표시)
- 각 그룹 헤더에 그룹명 + per-group 합계 (Total / Completed / Closed / In Dispute) 표시
- 그룹 내부에서는 기존처럼 인물 카드 4-col 그리드, Total 내림차순
- 각 그룹 헤더 클릭 시 Raw Data로 이동하며 `?capturedByGroup=Arch` 같은 그룹 필터 적용
- Reconciliation Row는 전체 합계 기준 1개 유지

### 4) Raw Data 그룹 필터 연동

`DefectRawDataPage.tsx`:
- query param `capturedByGroup` 추가
- 해당 그룹에 속한 인물 이름 배열로 `captured_by_name` IN 필터 적용
- 기존 `capturedBy=<name>` 단일 필터와 병행 가능

### 5) 검증

- Mech 팀 화면에서 Captured By 카드가 그룹별로 표시되는지
- Reconciliation OK 표시되는지
- 그룹/인물/지표 클릭 → Raw Data 필터 정상 동작

## 기술 메모

- 그룹 매핑은 코드 상수로 시작. 추후 admin 설정 가능하게 확장 여지 있으나 본 작업 범위 외
- `raw_payload`에 Captured by 키 자체가 없는 약 4,777행은 Unknown으로 집계 (재import 필요, 본 작업에서 다루지 않음)
- 변경 파일: `defect-cache.ts`, `captured-by-groups.ts`(신규), `DefectDashboardPage.tsx`, `DefectRawDataPage.tsx`
