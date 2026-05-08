## 문제

ABD(Docs Drawings) Raw Data 페이지에서 행을 선택하면 BulkActionBar가 항상 **Editable 0**으로 표시되고, 그 결과 다음 버튼들이 모두 비활성화됨:
- Apply (벌크 편집)
- Register to Critical Issue Board
- Duplicate
- Reassign
- Hide rows (soft delete)
- Delete permanently

(Export .xlsx, Copy as TSV는 권한과 무관하게 동작 중)

## 원인

`src/lib/bulk-actions.ts`의 `getEditableScopeMap()` 중 `entity === 'drawing'` 분기가 권한 판정을 너무 좁게 함:
- `admin`, `superuser` → `full`
- `d_superuser` + 팀 일치 → `team`
- 그 외 모두 → `none`

그러나 실제 `docs_drawings` RLS UPDATE 정책은 다음을 허용함:
```
admin | superuser | senior_user | user
  OR  d_superuser AND user_team_matches(team)
```

즉 `senior_user`, `user` 역할(현재 활성 사용자 108명 중 82명)이 DB에서는 수정 가능한데 UI가 "권한 없음"으로 잘못 판정 → 모든 벌크 버튼이 비활성화됨.

## 수정 내용

`src/lib/bulk-actions.ts`의 drawing 분기 권한 판정을 RLS와 일치시킴:
- `admin`, `superuser`, `senior_user`, `user` → 모든 선택 행에 대해 `full`
- `d_superuser` + 프로필 활성 + 팀 일치 → `team` (기존 그대로)
- 그 외 (`guest`, `super_guest`, 역할 없음) → `none`
- 비활성 프로필(`is_active = false`)은 비-admin 역할에 대해 `none` 처리

## 변경 파일

- `src/lib/bulk-actions.ts` 한 곳만 수정. 다른 파일 변경 없음.

## 검증 방법

- `user` 역할 계정으로 로그인 → ABD 행 선택 시 "Editable N"이 N으로 표시되고 Apply / Duplicate / Reassign / Critical 버튼 활성화
- `d_superuser` 계정 → 본인 팀 행만 editable로 카운트(기존 동작 유지)
- `guest` 계정 → editable 0 유지, 버튼 비활성화 유지
- Title/Remarks 필드 벌크 편집 → 성공, `docs_change_log`에 기록됨
- Delete permanently → 기존대로 admin/superuser만 활성

## 범위 외

- DB / RLS 변경 없음
- Subtest, Defect 벌크 흐름은 별도 RPC 사용 중이며 이미 정상 → 손대지 않음
