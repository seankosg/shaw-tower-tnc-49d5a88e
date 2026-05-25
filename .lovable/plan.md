## 목표
`Add Subtask` 시 반복되는 에러를 근본적으로 제거합니다. 이번 작업은 **Summary 집계 로직의 잘못된 enum 생성**을 바로잡는 데만 집중합니다.

## 구현 계획
1. **`punch_recalc_summary` 집계 규칙 수정**
   - Summary가 자식 rows를 집계할 때 더 이상 존재하지 않는 상태값(`rejected`, `delivered`, `in_progress`)을 만들지 않도록 수정합니다.
   - Gate 계열은 현재 enum 체계에 맞춰 `not_required / pending / approved`만 나오게 정리합니다.
   - Procurement 계열은 `not_required / pending / partially_secured / secured`만 나오게 정리합니다.

2. **과거 migration 소스도 같이 정정**
   - 현재 DB 함수만 고치면 나중에 재배포/복원 시 같은 문제가 다시 생길 수 있으므로, 원본 migration의 오래된 rollup 로직도 함께 수정합니다.
   - 즉, 이번 수정은 임시 패치가 아니라 **drift 재발 방지**까지 포함합니다.

3. **Pre Engineering block 로직은 분리 검증**
   - `Pre Engineering blocked`는 다음 단계 표시/준비 여부와 관련된 로직으로 보고, `Add Subtask` 실패 원인과는 분리해서 유지합니다.
   - 이번 수정에서는 진행 차단 UI/비즈니스 규칙은 건드리지 않고, 실제 에러를 내는 Summary rollup만 고칩니다.

4. **검증**
   - DB 함수 정의 기준으로 더 이상 잘못된 enum 문자열이 생성되지 않는지 확인합니다.
   - 관련 migration 소스에서도 동일한 잘못된 값이 남아 있지 않은지 확인합니다.
   - 이후 `Add Subtask` 경로에서 동일한 enum 에러가 재발하지 않는지 확인합니다.

## 기술 세부사항
- 대상 함수: `public.punch_recalc_summary`
- 대상 소스: punch summary/subtask 관련 migration 파일
- 수정 원칙:
  - 존재하지 않는 enum 값 생성 금지
  - 현재 DB enum 정의와 100% 일치
  - UI 원인으로 오해된 `Pre Engineering blocked` 로직은 이번 범위에서 제외

## 기대 결과
- `Add Subtask` 시 Summary 재계산이 실패하지 않음
- 동일 문제가 환경 재생성/복원 후에도 다시 유입되지 않음
- 원인과 무관한 `Pre Engineering blocked` 때문에 시간을 낭비하지 않도록 문제 범위가 명확해짐