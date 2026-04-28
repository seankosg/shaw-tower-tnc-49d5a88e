# T&C(Subtest) Import에 자동 재활성화 로직 적용

## 배경

Defect Import에는 이미 update 경로에서 `is_active: true`를 자동 설정하는 로직이 적용되어 있습니다. 동일한 패턴을 T&C(Subtest) Import에도 적용합니다.

## T&C Import의 차이점 (중요)

T&C Import는 Defect Import와 lookup 방식이 다릅니다.

`src/contexts/ImportContext.tsx` 334번 줄:
```ts
.eq('item_no', row.item_no).eq('mos_code', row.mos_code).eq('is_active', true)
```

기존 행 조회 시 **`is_active=true` 필터를 사용**하기 때문에, 이미 비활성화된 subtest는 "찾을 수 없음"으로 판정되어 update 경로가 아닌 **insert 경로**로 흘러갑니다. 이 상태에서 단순히 update payload에 `is_active: true`만 추가하면 비활성 행은 영원히 복구되지 않습니다.

## 변경 내용 (한 파일, 2곳 수정)

**파일:** `src/contexts/ImportContext.tsx`

### 1. Lookup에서 `is_active` 필터 제거 (~331~335줄)

활성/비활성 구분 없이 자연 키(`project_id` + `system_id` + `item_no` + `mos_code`)로만 조회하여 비활성 행도 매칭되도록 합니다. 동시에 select 컬럼에 `is_active`를 추가해 변경 감지에 사용합니다.

```ts
const { data: existing } = await supabase.from('subtests')
  .select('id, project_id, system_id, item_no, mos_code, subtest_id, updated_at, row_version, pred_planned_date, t1_planned_date, t2_planned_date, is_active')
  .eq('project_id', projectId!).eq('system_id', systemId)
  .eq('item_no', row.item_no).eq('mos_code', row.mos_code)
  .maybeSingle();
```

### 2. Update payload에 `is_active: true` 강제 설정 (~386~389줄 근처)

`updates.data_source_type = ...` 블록 옆에 한 줄을 추가합니다.

```ts
updates.data_source_type = dataSourceType;
updates.source_upload_id = uploadId;
updates.row_version = (existing.row_version || 1) + 1;
updates.subtest_id = row.subtest_id;
// Re-activate previously hidden subtests so they reappear on the data screens.
updates.is_active = true;
```

### 3. "no_changes" skip 분기 보정

374번 줄의 `if (Object.keys(updates).length === 0)` 분기는 활성 상태 행에는 그대로 유효하지만, **기존 행이 inactive였던 경우**에는 다른 컬럼 값이 모두 같더라도 재활성화 자체가 의미 있는 변경이므로 skip하지 않도록 조건을 보강합니다.

```ts
const needsReactivation = existing.is_active === false;
if (Object.keys(updates).length === 0 && !needsReactivation) {
  // 기존 skip 처리
}
```

`needsReactivation`이 true이면 skip하지 않고, 이후 update 블록에서 `updates.is_active = true`만 들어간 update가 실행되어 행이 복구됩니다.

## 영향 범위

- 영향 파일: `src/contexts/ImportContext.tsx` 한 파일 (Standard / Legacy import 양쪽 모두 같은 코드 경로 사용)
- DB 스키마 변경 없음 (`subtests.is_active` 컬럼은 이미 존재)
- 기존 행이 활성 상태인 일반적인 import 흐름의 동작은 그대로 유지
- 비활성 행이 있는 경우에만 재활성화가 발생

승인해 주시면 적용하겠습니다.
