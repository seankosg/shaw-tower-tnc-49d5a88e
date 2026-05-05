## Add new role: D.Super User (d_superuser)

### 권한 요약
- **Superuser와 동일**: 모든 모듈 페이지(Dashboard/Raw Data/Import/Export 등) 접근, 댓글, 모든 모듈 사용 가능.
- **Admin 탭 접근 금지**: `/admin/**` 경로는 superuser/admin 만.
- **차이점(쓰기)**: INSERT / UPDATE / DELETE 는 **자기 팀(`profiles.team` == row.`team`)** 의 row 만 가능. 다른 팀 row 는 읽기 전용.
- 일괄 롤백/스냅샷/마스터/필드 설정 등 admin 전용 기능은 사용 불가.

### 등급 순서 (변경 후)
```
guest < super_guest < user < senior_user < d_superuser < superuser < admin
```

---

### 1. DB 마이그레이션 (schema)

**(a) enum 값 추가**
```sql
ALTER TYPE public.app_role ADD VALUE 'd_superuser' BEFORE 'superuser';
```

**(b) 새 헬퍼 함수**
```sql
-- 팀 일치 여부
CREATE OR REPLACE FUNCTION public.user_team_matches(_user_id uuid, _team team_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND is_active = true
      AND team IS NOT NULL AND team = _team
  )
$$;

-- 팀 범위 쓰기 권한 (admin/superuser 또는 자기 팀의 d_superuser)
CREATE OR REPLACE FUNCTION public.can_write_for_team(_user_id uuid, _team team_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin_or_superuser(_user_id)
      OR (public.has_role(_user_id, 'd_superuser'::app_role)
          AND _team IS NOT NULL
          AND public.user_team_matches(_user_id, _team))
$$;
```

**(c) `is_admin_or_superuser` — 변경 없음**
Admin 페이지/스냅샷/마스터/필드 설정/롤백 등은 모두 이 함수에 의존하므로 d_superuser 는 자동으로 차단됨.

**(d) 기존 함수 확장 — d_superuser 가 자기 팀 row 에 한해 동작**
- `get_defect_edit_scope`, `get_subtest_edit_scope`: admin/superuser 분기 다음에
  ```sql
  IF public.has_role(_user_id, 'd_superuser') AND d.team IS NOT NULL
     AND prof.team = d.team THEN RETURN 'full'; END IF;
  ```
- `can_modify_defect_comment`, `can_modify_subtest_comment`, `can_edit_subtest`, `validate_defect_responsibility_update`: 동일 패턴 추가.
- `delete_*_cascade`, `delete_*_import_batch`, `rollback_*`, `preview_*`: 변경 없음 → admin/superuser 전용 유지(d_superuser 일괄 작업 차단).

**(e) RLS 정책 업데이트 — INSERT/UPDATE/DELETE 만**

대상 테이블 (team 컬럼이 있고 데이터 변경 가능): `defect_items`, `docs_drawings`, `docs_omm`, `docs_spare_part`, 그리고 subtests/tests 관련 테이블(있는 경우 동일 패턴).

DELETE 정책 예시 (`defect_items`):
```sql
DROP POLICY "Admins can delete defects" ON public.defect_items;
CREATE POLICY "Privileged can delete defects" ON public.defect_items
FOR DELETE TO authenticated
USING (public.can_write_for_team(auth.uid(), team));
```

UPDATE 정책 (`defect_items`):
```sql
USING (
  can_update_defect(auth.uid(), id)
  OR has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (has_role(auth.uid(), 'd_superuser') AND user_team_matches(auth.uid(), team))
)
-- WITH CHECK 동일
```

INSERT 정책 (`defect_items`):
```sql
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (has_role(auth.uid(), 'd_superuser') AND user_team_matches(auth.uid(), team))
)
```

**(f) Admin 전용 테이블** (`field_config`, `*_field_config`, `custom_field_definitions`, `defect_classification_*`, `defect_subcontractor_workscope`, `defect_work_types`, `defect_discipline_fallback`, `database_snapshots`, `event_log`, `app_settings`, `hdec_*_master`, `docs_org_alias`, `header_mappings`) — 모두 `is_admin_or_superuser` 그대로 유지. d_superuser 권한 없음.

---

### 2. 프론트엔드 변경

**(a) `src/types/enums.ts`**
- `AppRole` 에 `'d_superuser'` 추가
- `ALL_ROLES` 배열에 `senior_user` 와 `superuser` 사이에 삽입
- `ROLE_LABELS.d_superuser = 'D.Super User'`

**(b) `src/lib/role-permissions.ts`** (랭크 재조정)
```ts
ROLE_RANK = {
  guest: 0, super_guest: 1, user: 2, senior_user: 3,
  d_superuser: 4, superuser: 5, admin: 6,
}
```
라우트 최소 rank 갱신:
- `/admin` → **5** (superuser/admin 만, d_superuser 차단) ← **핵심 변경**
- `/docs/org-mapping` → 5 (superuser/admin)
- 그 외 모듈 페이지(`/docs/*`, `/defects/*`, `/tc/*`, `/import`, `/export`, `/mobile` 등)는 d_superuser 가 자동 통과하도록 기존 rank(2) 유지 → d_superuser(4) ≥ 2

**(c) `src/contexts/AuthContext.tsx`**
- 새 helper:
  ```ts
  const isDSuperuser = roles.includes('d_superuser');
  ```
- Admin UI 게이트는 기존 `isSuperuser || isAdmin` 그대로 (d_superuser 제외).

**(d) UI 분기 업데이트** — 기존 `['admin','superuser','senior_user','user']` 체크 위치에 `'d_superuser'` 추가:
- `src/pages/docs/DocsDrawingDetailPage.tsx`
- 그 외 grep 으로 동일 패턴 검색하여 5~7곳 일괄 추가
- `src/pages/admin/EventLogTab.tsx`: 필터/배지에 `d_superuser → 'D.Super User'` 라벨 추가 (이 페이지 자체는 admin 만 봄)
- `src/components/raw-data/BulkActionBar.tsx`: `is_admin_or_superuser` RPC 결과에 의존하는 일괄삭제 버튼 그대로 유지(d_superuser 는 표시 안 됨)

**(e) Admin → User Management**
- 역할 선택 옵션 자동 추가 (`ALL_ROLES` 사용 시 자동)
- 라벨/툴팁: "D.Super User — 자기 팀 데이터만 편집 가능, Admin 탭 접근 불가"

---

### 3. 검증 항목 (수동)
- d_superuser 로그인 → 사이드바에서 Admin 메뉴 비표시, `/admin` 직접 접근 시 차단.
- 모든 모듈 페이지(Dashboard/Raw Data/Import/Export 등) 접근 가능.
- 자기 팀 row → 수정/삭제/생성 가능.
- 다른 팀 row → 수정/삭제 시 RLS 거부, UI readonly.
- 일괄 롤백/스냅샷/마스터 변경/필드 설정 → 모두 차단.

### 범위 외
- 기존 superuser/admin/senior_user 권한 변경 없음.
- 마스터/알리아스/필드 설정 등 admin 전용 영역은 그대로.
