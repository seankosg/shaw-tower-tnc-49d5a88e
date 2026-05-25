## 목표

Punch 항목에 **작성자(creator)** 개념을 도입하고, 기존 Team 기반 RLS 정책은 **유지하면서** 작성자 본인은 항상 자신의 행을 수정/삭제할 수 있도록 확장합니다. 기존 행은 `created_by = NULL` 로 두며, 그 경우 권한 판정은 기존 정책(역할 + Team)만으로 결정됩니다.

## 1) DB 마이그레이션

### (a) 컬럼 추가
```sql
ALTER TABLE public.punch_items
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_punch_items_created_by ON public.punch_items(created_by);
```
- 기존 행은 NULL 유지.
- FK ON DELETE SET NULL 로 유저 삭제 시에도 행은 보존.

### (b) RLS 정책 갱신 — 작성자 본인 OR 절 추가

`Privileged can update punch` 및 `Privileged can delete punch` 정책을 DROP 후 재생성:

```sql
DROP POLICY "Privileged can update punch" ON public.punch_items;
CREATE POLICY "Privileged can update punch" ON public.punch_items
  FOR UPDATE
  USING (
    has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
    OR (has_role(auth.uid(), 'd_superuser') AND user_team_matches(auth.uid(), team))
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  )
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
    OR (has_role(auth.uid(), 'd_superuser') AND user_team_matches(auth.uid(), team))
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  );

DROP POLICY "Privileged can delete punch" ON public.punch_items;
CREATE POLICY "Privileged can delete punch" ON public.punch_items
  FOR DELETE
  USING (
    can_write_for_team(auth.uid(), team)
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  );
```

- INSERT/SELECT 정책은 변경 없음(현재 그대로).
- 결과 매트릭스:
  - admin / superuser / senior_user / user → 기존대로 전체 행
  - d_superuser → 같은 Team 행 + 본인 작성 행
  - super_guest / guest → 본인 작성 행만 수정/삭제 (실질적으로 거의 없음)

### (c) `add_punch_subtask` RPC — created_by 기록

기존 함수 INSERT 문에 `created_by = auth.uid()` 추가(첫 child 자동 생성 INSERT, 신규 subtask INSERT 둘 다).

## 2) 어플리케이션 코드

### (a) `src/lib/punch-excel-utils.ts` — Import 시 작성자 기록

`upsertPunchRows` 의 신규 INSERT 페이로드에 `created_by: opts.updatedBy` 추가. UPDATE 경로는 건드리지 않음(작성자 보존).

### (b) `src/pages/PunchDetailPage.tsx`
- `useAuth()` 에서 `profile.user_id` 이미 사용 중.
- `disabled` 계산을 다음으로 확장:
  ```ts
  const isOwner = !!item?.created_by && item.created_by === profile?.user_id;
  const disabled = (isReadOnlyRole || isDSuperOutOfTeam) && !isOwner;
  ```
- Read-only 안내 문구도 `isOwner` 일 땐 숨김.
- 삭제 버튼 노출 조건도 동일 규칙 적용(이미 있는 경우).

### (c) `AddPunchSubtaskDialog.tsx` 또는 수동 신규 행 생성 경로
- 신규 row insert 시 `created_by: profile?.user_id ?? null` 명시(RPC가 처리하므로 RPC 경로는 변경 불필요).

### (d) Raw Data / 일괄 수정 경로
- 기존 bulk update 가 RLS 로 보호되므로 UI 변경 불필요. 다만 본인 작성 행만 골라 편집할 수 있도록 차후 필터(Owner: Me) 토글은 별도 작업으로 분리.

## 3) UI 작성자 표시
- Detail 페이지 헤더 메타에 `Created by` 한 줄 추가(닉네임/이메일은 profiles 조인). NULL 이면 "Imported / Legacy".

## 검증 시나리오

1. **신규 import**: 새로 insert 되는 행은 `created_by` 가 임포터 user_id 로 기록됨. 기존 행 update 시 `created_by` 보존(NULL 유지).
2. **superuser**: 모든 Team 의 모든 행을 기존대로 수정/삭제.
3. **d_superuser, Arch Team**: Arch 행 전체 + 본인이 작성한 Mech 행도 수정/삭제 가능. 본인 미작성 Mech 행은 read-only.
4. **user(일반), Mech Team**: 기존 정책상 전체 수정 가능 → 변화 없음.
5. **super_guest**: 본인이 직접 만든 행만 수정/삭제 가능, 기타는 read-only.
6. **기존 행(created_by NULL)**: 작성자 기반 OR 절이 작동하지 않으므로 권한 판정이 기존 Team/역할 정책과 동일.
7. **RPC `add_punch_subtask`**: 신규 subtask 행에 `created_by = auth.uid()` 기록 확인.

## 비범위

- Subtest / Defect 모듈은 변경 없음.
- 작성자 기반 필터 UI(예: "Show only mine") 토글은 별도 작업.
- 작성자 프로필 표시(아바타 등)는 후속.
