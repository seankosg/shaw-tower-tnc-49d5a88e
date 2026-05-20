## 변경 파일

`src/lib/docs-stage-records.ts` — OMM stage record 생성 부분(라인 400~421)만 수정.

## 로직

OMM 워크플로우에서 어떤 행이 "Final Submission Status로 옮겨갔다"의 판정 기준:

```ts
const movedToFinal =
  !!row.final_planned_date ||
  !!row.final_actual_date ||
  !!row.final_response_status;
```

위 조건이 true인 경우, 해당 행은 다음 stage record에서 **제외**:

- `omm.sub2_submission`
- `omm.sub2_review`
- `omm.sub3_submission`
- `omm.sub3_review`

(Final 단계로 진입한 행은 sub2/sub3 카드의 분모·분자 양쪽 모두에서 빠지므로 카운트와 완료율이 함께 감소)

`omm.sub1_submission`, `omm.sub1_review`, `omm.final_submission`, `omm.final_approval`은 변경 없음.

## 영향 범위

`buildStageRecords('omm', ...)`를 사용하는 모든 화면(Docs Executive Dashboard, Report, PPT 등)에서 2nd/3rd Submission 카드 수치가 자연스럽게 재계산됨.

## 비변경 항목

- ABD는 사용자가 별도 언급 없으므로 그대로 둠.
- Raw Data 페이지 자체 필터/표시는 변경 없음.
