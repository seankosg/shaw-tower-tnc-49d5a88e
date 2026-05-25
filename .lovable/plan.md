## 원인

`add_punch_subtask` RPC에서 team 캐스팅을 `public.team_enum` 으로 하고 있는데, 실제 DB에 존재하는 타입은 `public.team_type` 입니다. 그래서 subtask 추가 시 `type "public.team_enum" does not exist` 에러가 발생합니다.

## 수정 계획

마이그레이션 한 건으로 `add_punch_subtask` 함수를 `CREATE OR REPLACE` 하여 다음 한 줄만 교체:

```text
COALESCE((p_payload->>'team')::public.team_enum, v_parent.team)
→ COALESCE((p_payload->>'team')::public.team_type, v_parent.team)
```

나머지 로직(부모 승격, 첫 자식 복제, 권한 체크, 자식 카운트)은 그대로 유지합니다.

## 검증

- 마이그레이션 적용 후 Detail 페이지에서 Add Subtask 재시도하여 성공 토스트 확인
- Raw Data 에서 부모가 Summary 배지로 표시되고 자식 2건이 보이는지 확인
