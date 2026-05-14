# Photo OCR 숫자 오인식 수정 계획

현재 문제는 같은 원본 이미지에서도 `2513 / 2098`이 아니라 `5 / 17`처럼 다른 숫자로 바뀌는 점입니다.
원인은 OCR 모델 자체만이 아니라, **Pass-2 검증용 crop가 캡션 strip 없이 사진 영역만 잘리는 경우에도 그 결과를 최종 issue 번호로 덮어쓰는 구조**에 있습니다. 이때 `+5` 오버레이나 사진 내부 표기(예: `...17`)가 issue 번호로 잘못 채택됩니다.

## 작업 내용

1. **Pass-2 crop 검증 강화**
   - crop 안에 실제 WhatsApp caption strip이 포함됐는지 확인하는 방어 로직을 추가합니다.
   - 캡션 후보가 crop의 하단부, 좌측 정렬 위치, dark strip 위에 있는 경우만 유효 후보로 취급합니다.
   - 이 조건을 만족하지 않으면 Pass-2 결과는 폐기하고 Pass-1 값을 유지합니다.

2. **Pass-2 덮어쓰기 정책 수정**
   - 지금은 `verify.confidence >= pass1Conf || pass1 !== verify.issue_no` 조건 때문에 숫자가 다르기만 해도 쉽게 덮어씁니다.
   - 이를 `Pass-2가 더 강한 근거를 가질 때만` 덮어쓰도록 바꿉니다.
   - 예: caption_raw 존재, 길이 규칙 일치, 금지 패턴 미포함, crop 검증 통과 등 복수 조건이 맞을 때만 교체합니다.

3. **Pass-2 OCR 프롬프트 보강**
   - `+N` 오버레이, 사진 내부 숫자, 배관/자재 라벨, 타임스탬프를 절대 issue 번호로 읽지 않도록 crop 전용 프롬프트를 강화합니다.
   - 숫자는 반드시 `photo grid 바로 아래 dark strip의 left-aligned caption`일 때만 허용하도록 명시합니다.

4. **후처리 교차검증 추가**
   - Pass-1과 Pass-2 결과가 다르면 자동 채택하지 않고 교차검증합니다.
   - Pass-2 숫자가 너무 짧거나(예: `5`, `17`) caption strip 근거가 없으면 원래 값을 유지하고 `notes`에 불일치 사유를 남깁니다.
   - 필요하면 낮은 신뢰도로 `needs_review`로 보내도록 조정합니다.

5. **회귀 테스트 추가**
   - 현재 샘플 구조를 반영한 테스트를 추가해 `+5` 오버레이와 사진 내부 `17`류 숫자가 issue 번호로 채택되지 않도록 검증합니다.
   - `2513`, `2098` 같은 실제 caption 패턴은 유지되는지 확인합니다.

## 예상 결과

- 같은 이미지를 여러 번 넣어도 결과가 들쭉날쭉 바뀌는 현상이 크게 줄어듭니다.
- 잘못된 crop에서 나온 `5`, `17`, `153` 같은 숫자가 최종 값으로 덮어써지는 문제를 막습니다.
- 애매한 경우는 잘못 확정하지 않고 review로 남기게 됩니다.

## 기술 메모

- 수정 대상 중심 파일:
  - `src/contexts/PhotoOcrContext.tsx`
  - `src/lib/defect-photo-ocr.ts`
  - `supabase/functions/defect-photo-ocr-crop/index.ts`
  - 필요 시 `supabase/functions/defect-photo-ocr/index.ts`
- 핵심 위험 지점:
  - crop band가 caption strip을 충분히 포함하지 못함
  - Pass-2 결과를 너무 공격적으로 채택함
  - crop 전용 OCR이 사진 내부 숫자를 caption으로 환각함