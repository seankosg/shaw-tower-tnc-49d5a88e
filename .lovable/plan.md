## 조사 결과

`docs_change_log` 테이블을 점검한 결과:

- 컬럼 `changed_by uuid`는 이미 존재하며, **모든 행에 값이 채워져 있습니다** (NULL = 0). OMM 한정 2,859건 전부 정상.
- 등장하는 4명의 `changed_by` 모두 `profiles.user_id`와 매핑됩니다.

따라서 **별도의 백필 마이그레이션은 필요 없습니다.** UI에서 이름만 노출하면 됩니다. (백필이 필요했다면 excel_import는 `docs_upload_batches.created_by`, 그 외에는 `docs_omm.updated_by`로 보정하는 방안이 있었지만, 현 데이터로는 불필요)

## 변경 범위

`src/pages/docs/DocsOMMDetailPage.tsx` 한 파일만 수정.

### 1. 로그 조회 시 변경자 이름 함께 가져오기

`docs_change_log` 조회 후, 등장한 `changed_by` uuid 목록으로 `profiles` 테이블에서 `user_id, name`을 한 번에 조회 → uuid→name Map 구성.

(FK 조인이 정의되어 있지 않으므로 PostgREST embed 대신 두 번 fetch 후 클라이언트에서 join하는 방식이 안전)

### 2. Change History 카드 UI에 컬럼 추가

기존 `[140px_140px_1fr]` 3-column 그리드에 변경자 컬럼을 추가하여 4-column으로 확장:

```
[일시 140px] [변경자 110px] [필드 140px] [old → new 1fr]
```

이름을 찾지 못한 경우 `—` 로 표시.

## 사용자 확인 사항

1. 위 단일 파일 수정으로 진행해도 될까요?
2. 동일하게 다른 docs 상세페이지(Drawing/Spare Part/Warranty)에도 일괄 적용을 원하시나요, 아니면 **OMM만** 적용할까요?
