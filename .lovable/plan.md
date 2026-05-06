## 문제 진단

`DocsWarrantyRawDataPage.tsx`(L886–899)와 `DocsOMMRawDataPage.tsx`(L656–682) 모두 4개 필드의 옵션을 **현재 화면에 로드된 행에서 distinct 추출**해 만들고 있습니다:

```ts
const optionFields = useMemo(() => {
  const opts = (field) =>
    [...new Set(rows.map((r) => r[field]).filter(Boolean))]...
  return {
    team: opts('team'),
    subcontractor_name: opts('subcontractor_name'),
    hdec_pic_name: opts('hdec_pic_name'),
    hdec_eng_name: opts('hdec_eng_name'),
    ...
  };
}, [rows]);
```

이 옵션은 **컬럼 필터 드롭다운**과 **BulkActionBar의 select**, 양쪽에서 모두 사용됩니다. 결과적으로:
- 마스터에 등록된 사람/업체라도 **현재 데이터에 한 번도 등장하지 않으면** 드롭다운에 안 보임
- 새 행을 만들 때나 잘못된 데이터를 정정할 때 마스터 표준값으로 일괄 변경 불가
- 다른 모듈(Defect Detail, OMM Detail, Docs As-Built)은 이미 마스터를 직접 조회하고 있어 일관성이 깨짐

## 정정 방향 — 공통 마스터를 단일 소스로

다른 모듈(`DocsRawDataPage`, `DefectDetailPage`, `DocsOMMDetailPage`)이 이미 사용하는 패턴을 그대로 재사용합니다.

| 필드 | 소스 |
|---|---|
| **team** | `team_type` enum: `Mech`, `Elec`, `Arch`, `Supp`, `Design` (하드코드 상수) |
| **subcontractor_name** | `subcontractor_master` 테이블 (`is_active = true`, `type in ('sub','subsub')`, `name` 사용) |
| **hdec_pic_name** | `hdec_pic_master` 테이블 (`is_active = true`, `name`) |
| **hdec_eng_name** | `profiles` 테이블 (`is_active = true`, `name` distinct) — `DocsRawDataPage`와 동일 규칙 |

## 작업 내용

### 1) 공통 훅 신규 작성 — `src/hooks/useCommonMasters.ts`
- 한 번 마운트 시 4개 마스터를 병렬로 조회 (`Promise.all`)
- 반환: `{ teamOptions, subcontractorOptions, hdecPicOptions, hdecEngOptions, loading }`
- 각 옵션은 `{ value, label }[]` (이미 알파벳순 정렬, distinct)
- TanStack Query 없이 `useEffect` + 모듈 레벨 메모리 캐시(60초)로 단순화 — Warranty/OMM이 같은 세션에서 양쪽 다 들러도 1회만 fetch
- 페이지에서 새 마스터가 추가됐을 때를 대비해 `refresh()` 노출

### 2) `DocsWarrantyRawDataPage.tsx` 수정
- `optionFields` 정의에서 `team` / `subcontractor_name` / `hdec_pic_name` / `hdec_eng_name` 4개 키를 마스터에서 받은 옵션으로 교체
- 나머지 키(`category`, `acra_info_status`)는 기존대로 distinct 추출 유지 — 마스터가 없는 도메인 값
- 컬럼 필터 드롭다운에 전달되는 `filterOptions`도 같은 소스를 보도록 정리 (이미 `optionFields`를 보고 있으므로 자동으로 반영됨)
- BulkActionBar `bulkFields`의 4개 필드 옵션이 자동으로 마스터값으로 전환됨 (참조만 바뀜)

### 3) `DocsOMMRawDataPage.tsx` 수정
- 동일한 4개 키 교체 (Warranty와 같은 패턴)
- 나머지(`category_group`, `category`, `training_required`, `current_stage`, `current_status`, `draft_response_status`, `final_response_status`)는 그대로 유지

### 4) 정렬·표시 보정
- 마스터에 없는 값이 raw_payload/import로 이미 들어와 있는 경우, **드롭다운에 같이 보이도록** 마스터 옵션과 현재 데이터에서 추출한 값을 union (마스터 우선, 그 외는 라벨 끝에 ` (legacy)` 표기)
- 이렇게 하면 기존 데이터를 가리지 않으면서도 "표준값으로 일괄 정정"이 가능해짐

## 변경 파일

- 신규: `src/hooks/useCommonMasters.ts`
- 수정: `src/pages/docs/DocsWarrantyRawDataPage.tsx`
- 수정: `src/pages/docs/DocsOMMRawDataPage.tsx`

## 영향 범위

- DB 스키마 변경 없음
- RLS/엣지함수 변경 없음
- 기존 데이터 그대로 표시됨 (legacy 값 union 처리 덕분)
- 두 페이지의 컬럼 필터·BulkActionBar 양쪽에서 동일하게 마스터 기반 옵션 노출
