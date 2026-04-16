

# SubtestList 컬럼 순서 변경 계획

## 요청 사항
1. **Equipment** 컬럼을 Item No 다음에 추가
2. **Predecessor** 컬럼을 Description 다음으로 이동
3. **T1/T2**: Planned → Status 순서로 변경 (현재는 Status → Planned)

## 변경할 컬럼 순서

```text
현재:  System → Item No → Subtest ID → MOS Code → Description → T1 Status → T1 Planned → T2 Status → T2 Planned → Predecessor → Subcontractor → HDEC PIC → Source → Updated

변경:  System → Item No → Equipment → Subtest ID → MOS Code → Description → Predecessor → T1 Planned → T1 Status → T2 Planned → T2 Status → Subcontractor → HDEC PIC → Source → Updated
```

## 수정 파일
- **`src/pages/SubtestList.tsx`**: columns 배열 순서 재배치, Equipment 컬럼 정의 추가 (이미 데이터에 `equipment` 필드가 포함되어 있으므로 컬럼만 추가하면 됨)

