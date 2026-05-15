## 문제

Import History의 배지는 `defect_upload_batches.status` DB 컬럼을 그대로 표시합니다. 그런데 import 실행 중 예외가 발생하면:

- 메모리상 파일 status는 `failed`로 바뀜 (`runImport` catch)
- DB row의 status는 batch 생성 시점에 찍힌 `'processing'` 그대로 남음
- 정상 종료 경로에서만 `status: 'completed'`로 update (1214행)

→ History에서 영원히 "processing" 배지로 표시됨.

## 수정안

`src/contexts/DefectImportContext.tsx` `importOneFile` 함수에서 batch row 생성(564행) 이후의 모든 처리를 try/catch로 감싸고, 실패 시 다음 작업을 수행한 뒤 에러를 rethrow:

```ts
await supabase.from('defect_upload_batches').update({
  status: 'failed',
  processed_rows: insertedCount + updatedCount + skipped + rejected,
  success_rows: insertedCount + updatedCount,
  skipped_rows: skipped,
  rejected_rows: rejected,
  error_message: (error as Error)?.message?.slice(0, 1000) ?? 'Import failed',
}).eq('id', uploadId);
```

(`error_message` 컬럼이 없는 경우 해당 키를 생략 — 우선 컬럼 존재 여부 확인 후 결정)

추가로 History 페이지(`DefectImportLogsPage.tsx`)의 `statusColor` 맵에 `failed`(빨강) 항목이 이미 존재하는지 확인하고 없으면 추가합니다.

## 사전 확인 항목

1. `defect_upload_batches` 테이블에 `error_message` 컬럼이 있는지 — 없으면 query에서 빼고 status만 업데이트
2. `statusColor['failed']` 키 존재 여부

## 검증

- 의도적으로 실패하는 시트(예: 잘못된 컬럼명 가진 파일) 임포트 후 History에서 해당 배치가 빨간 "failed" 배지로 표시되는지 확인
- 정상 임포트는 기존대로 "completed" 표시되는지 회귀 확인

## 영향 범위

- `src/contexts/DefectImportContext.tsx` 1곳 (try/catch 래핑 + 실패 시 update 호출)
- 필요 시 `src/pages/DefectImportLogsPage.tsx` `statusColor` 보강
- 다른 importer(T&C, Docs)에도 동일 패턴 가능성 있으나 이번 작업 범위 밖
