## 문제

ABD Import 후 로그상 876행이 정상 처리됐지만 Raw Data에 보이지 않습니다.

**원인**: 이전에 숨김 처리(soft-delete, `is_active=false`)된 행들이 reimport 시에도 `is_active=false` 상태 그대로 유지됨. Raw Data 조회는 `is_active=true` 필터를 사용하므로 가시성 회복 안 됨.

검증:
- 최신 배치의 876행 모두 `is_active=false`
- 데이터 자체는 갱신됨 (change log 기록됨)
- `loadExistingDrawings()`가 `is_active` 필터 없이 매칭하여 비활성 행도 UPDATE 대상에 포함

## 해결 방향

**Reimport는 데이터 복원 의도** → UPDATE 시 자동으로 `is_active=true`로 되살림.
ABD뿐 아니라 OMM / Warranty / Spare Part adapter 모두 같은 패턴이므로 동시에 보정해 향후 재발 방지.

## 변경 파일

### 1. `src/lib/docs-import-workers.ts`
모든 4개 adapter (`abdAdapter`, `ommAdapter`, `warrantyAdapter`, `sparePartAdapter`)의 payload 빌드 부분에 다음 추가:
```ts
is_active: true,
```
- INSERT 시: 기본값과 동일 → 무해
- UPDATE 시: 숨김 처리된 행을 자동 복원
- `*_TRACKED_FIELDS`에는 추가하지 않음 (audit 노이즈 방지)

### 2. `src/contexts/docs-import/createDocsImportProvider.tsx` 결과 화면 메시지
import 결과 패널에 "Reactivated rows" 카운터를 안내 (선택). 핵심은 #1.

### 3. 데이터 백필 (1회성 SQL)
이번 사용자가 reimport한 ABD 행들의 가시성 즉시 회복:
```sql
UPDATE public.docs_drawings d
SET is_active = true, updated_at = now()
FROM public.docs_upload_batches b
WHERE d.source_upload_id = b.id
  AND b.uploaded_file_name LIKE 'SHAW_Drawings_reimport%'
  AND d.is_active = false;
```
영향: 약 1,455행 (876 + 579)

### 4. 메모리 기록 (재발 방지 룰)
`mem://features/business-rules`에 다음 규칙 추가:
> Docs/OMM/Warranty/SparePart import의 UPDATE 분기는 항상 `is_active=true`를 명시적으로 설정한다 (reimport = 복원 의도). 신규 import worker 추가 시 동일 규칙 적용.

## 변경하지 않는 것
- `is_active` 자체 컬럼 / Bulk Soft Delete 기능 / RLS 정책
- 컬럼 매핑 / 검증 로직
- INSERT 분기 (이미 DB 기본값 `true`)
