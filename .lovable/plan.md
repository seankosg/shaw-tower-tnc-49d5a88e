## 검증 결과: 추가 작업 불필요

### 1. `punch_field_config` 시드 상태 — 완료됨

DB 조회 결과 **38개 행 모두 시드되어 있음** (이전 턴에서 삽입 완료). `PUNCH_FIELDS` 레지스트리(38개 항목)와 1:1 일치합니다.

| 그룹 | 필드 수 | sort_order 범위 |
|---|---|---|
| identity | 4 (item_no, outstanding_work, location, level) | 10–50 |
| classification | 7 (category1–3, critical_level, work_type, main_trade, sub_trade) | 60–120 |
| people | 5 (team, subcontractor, subsub, hdec_pic, hdec_eng) | 130–160 |
| schedule | 4 (planned/actual × start/completion) | 170–200 |
| progress | 7 (planned/actual/variance pct, health, completion_status, data_date, weight) | 210–270 |
| pre_engineering | 10 (material/drawing/mos approval+date, procurement+date, ready, blockers) | 280–370 |
| meta | 1 (remarks) | 380 |

- `outstanding_work` 만 `is_required = true` (레지스트리와 일치)
- `planned_progress_pct`, `progress_variance_pct`, `health_status`, `pre_engineering_ready`, `pre_engineering_blockers` 5개는 `source_origin = 'derived'` (계산 필드)
- 나머지 33개는 `source_origin = 'system'`
- 모든 행 `is_enabled = true` (단, `category3` 만 비활성 — 사용 안 함)

### 2. Punch Raw Data 페이지 반영 — 코드 검증 완료

`src/pages/PunchRawDataPage.tsx` 의 `visibleFields` 계산 로직:

```
PUNCH_FIELDS (registry, 38개)
  + punch_field_config 의 dynamic 필드 (registry에 없는 것)
  → sortFieldNames(getOrder)         ← DB sort_order 우선
  → filter(isFieldVisible(roles))    ← DB is_enabled + visible_to_roles 적용
```

따라서 다음이 자동 반영됩니다:
- Admin이 `display_name` 변경 시 → 컬럼 헤더 라벨 즉시 변경
- `sort_order` 조정 시 → 컬럼 순서 즉시 변경
- `is_enabled = false` 또는 `visible_to_roles` 제한 시 → 해당 컬럼 숨김
- `original_header` 입력 시 → 컬럼 헤더 툴팁에 표시
- Admin이 `punch_field_config` 에 새 행 추가 (registry 외) 시 → `raw_payload[original_header]` / `custom_payload[field_name]` 에서 값을 읽어 동적 컬럼으로 표시

### 3. 결론

이미 이전 턴에서 시드 + 페이지 통합이 모두 완료된 상태입니다. **추가 코드 변경이나 마이그레이션 불필요**합니다.

### 다음에 해볼 만한 검증 (선택)

원하시면 build 모드로 전환 후 다음을 실행할 수 있습니다:
1. Admin → Field Config → Punch 에서 `Item No` 의 `display_name` 을 임시로 바꿔보고 Raw Data 헤더가 즉시 반영되는지 확인
2. `sort_order` 두 필드를 swap 하고 컬럼 순서가 바뀌는지 확인
3. 임의 필드 `is_enabled = false` 후 컬럼이 사라지는지 확인

진행할 검증 시나리오가 있으면 알려주세요.
