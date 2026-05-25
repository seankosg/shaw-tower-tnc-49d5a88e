## 원인

`punch_recalc_summary(p_summary_id)` 함수 (migration `20260525045831`)에서 Summary 행 health 재계산 시 존재하지 않는 enum 값을 캐스팅하고 있음:

```sql
v_health := CASE
  WHEN v_variance >= 0 THEN 'on_track'::public.punch_health_status
  WHEN v_variance >= -10 THEN 'at_risk'::public.punch_health_status  -- ❌
  ELSE 'behind'::public.punch_health_status
END;
```

`punch_health_status` enum 정의:
```
ahead, on_track, behind, critical   (at_risk 없음)
```

Subtask 추가 → `add_punch_subtask` → rollup → `punch_recalc_summary` 호출 시 enum 변환 실패로
`invalid input value for enum punch_health_status: "at_risk"` 가 발생하여 RPC 전체가 롤백됨.

## 해결 방안

행 단위 트리거(`trg_set_health` / `punch_rollup_trigger`)가 이미 4단계 기준으로 health_status를 계산함:

| variance v | health |
|---|---|
| v ≥ 5 | ahead |
| -5 < v < 5 | on_track |
| -15 < v ≤ -5 | behind |
| v ≤ -15 | critical |

`punch_recalc_summary` 안의 CASE를 동일한 4단계로 교체하여 enum 정합성을 맞춤. (사용자가 언급한 "healthy 로직 삭제 검토"는 health 자체를 제거하지 않고, 잘못된 자체 계산을 표준 로직으로 통일하는 것으로 해석.)

### 수정 SQL

새 migration 한 건으로 `punch_recalc_summary` 함수를 `CREATE OR REPLACE`. 본문은 기존과 동일하며 `v_health` CASE 부분만 다음으로 교체:

```sql
v_health := CASE
  WHEN v_variance >= 5  THEN 'ahead'::public.punch_health_status
  WHEN v_variance > -5  THEN 'on_track'::public.punch_health_status
  WHEN v_variance > -15 THEN 'behind'::public.punch_health_status
  ELSE 'critical'::public.punch_health_status
END;
```

나머지 로직(weight rollup, stage_status, gate aggregation, override 보존)은 그대로 유지.

## 부가 검토

- `add_punch_subtask`, `punch_rollup_trigger` 등 다른 함수에서는 `at_risk` 사용 없음 확인 완료.
- 기존 punch_items 데이터 중 health_status='at_risk'는 enum에 없으므로 저장 자체가 불가 → 데이터 마이그레이션 불필요.
- 트리거가 행 단위로 이미 health 재계산하므로 Summary 행에 대해서도 자동 일관성 유지됨.

## 변경 파일

- 신규 migration: `punch_recalc_summary` 함수의 v_health CASE만 4단계 enum 값으로 수정
