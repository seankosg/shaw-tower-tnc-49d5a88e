## 문제 진단

업로드 로그의 모든 행이 `[PGRST204] Could not find the '_dateWarnings' column of 'defect_items' in the schema cache` 로 reject 되고 있습니다.

### 원인
`src/contexts/DefectImportContext.tsx` 1060번 줄 부근에서 DB insert payload를 만들 때 파서 결과를 그대로 spread 합니다:

```ts
const payload = { ...row, project_id: ..., ... };
delete payload.rawRowNo;
delete payload.id;
delete payload.custom_field_errors;
```

파서(`src/lib/defect-parser.ts` 624번)는 날짜 셀에서 경고가 발생한 행에 한해 내부용 키 `_dateWarnings`를 붙여 반환합니다. 이 키가 payload에 남은 채 PostgREST로 전송되면, 실제 컬럼이 아니므로 batch 전체가 PGRST204로 실패합니다.

### 왜 "new" 시트에서만 발생했나
- 다른 시트는 날짜 형식이 정상 → `dp.warnings.length === 0` → `_dateWarnings` 키 자체가 추가되지 않음 → 통과
- "new" 시트는 어떤 날짜 셀에서 경고가 발생 → 모든(또는 일부) 행에 `_dateWarnings` 포함 → batch 전체 reject
- DB 로그 caption도 row 단위가 아닌 chunk 전체에 같은 reason이 찍히는 이유와 일치합니다 (1개 행이 schema-cache 에러를 일으키면 chunk 전체 실패).

## 수정안 (한 곳만 손대면 됨)

`src/contexts/DefectImportContext.tsx`의 payload 정리 블록(1082~1084행 근처)에 다음 한 줄을 추가:

```ts
delete payload._dateWarnings;
```

추가로 향후 같은 사고 재발 방지를 위해, 같은 자리에서 **언더스코어로 시작하는 모든 키를 일괄 strip** 하도록 보강합니다:

```ts
for (const k of Object.keys(payload)) {
  if (k.startsWith('_')) delete payload[k];
}
```

이렇게 하면 파서가 앞으로 다른 `_xxx` 내부 키를 추가하더라도 자동 보호됩니다.

## 영향 범위

- 변경 파일: `src/contexts/DefectImportContext.tsx` 1줄~3줄 추가
- 비즈니스 로직, 검증, 진척, RLS, 컬럼 매핑 변화 없음
- `_dateWarnings`는 이미 1행 위 621~622번에서 row 로그 작성에 사용되고 있으므로, payload에서만 제거되어도 경고 표시 기능은 유지됩니다
- T&C importer(`src/contexts/ImportContext.tsx`)도 동일 패턴이지만 거기서는 다른 strip 경로를 사용 — 이번 변경 범위 밖, 추후 점검 권장 (별도 작업으로 표시)

## 검증

1. 수정 후 동일한 "new" 시트를 재 import → reject 0, inserted/updated 정상
2. 의도적으로 잘못된 날짜 형식이 있는 행 → 경고는 row log에 남고, defect_items insert는 성공해야 함
3. 기존 정상 시트 회귀 없음 확인
