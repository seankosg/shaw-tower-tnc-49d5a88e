# Spare Part Detail Page

OMM Detail 패턴을 그대로 미러링하여 `docs_spare_part` 행 1개를 상세 조회/편집하는 페이지를 추가합니다. Raw Data 페이지에서 행을 클릭하면 진입합니다.

## 추가할 파일

1. **`src/pages/docs/DocsSparePartDetailPage.tsx`** — `DocsOMMDetailPage`를 베이스로 작성
   - URL: `/docs/spare-part/:id`
   - 헤더: Category · Parent Item · S/N · Status 배지, "Back to Raw Data" + "Comments" 버튼
   - **Overview 카드**: Category, S/N, Parent Item, Material, Spec Ref, Status (badge)
   - **Spare Requirements 카드**: Spares Requirements, Unit, Spares Quantity, Storage Area Required
   - **Assignment 카드**: Subcontractor, HDEC PIC, HDEC Eng, Trade, Team
   - **Notes 카드**: Remarks (textarea)
   - **Comments 카드**: `<SparePartComments sparePartId={id} />` (#comments 앵커)
   - 각 필드는 OMM Detail과 동일한 inline edit + Save/Cancel + 권한 체크 + `docs_change_log`에 변경 이력 기록 (sub_module='spare_part')
   - row_version 낙관적 잠금 사용

2. **`src/components/comments/SparePartComments.tsx`** — `OmmComments.tsx`를 미러링
   - 새 테이블 `spare_part_comments`, `spare_part_comment_reads` 사용
   - 멘션, 답글, 편집/삭제, 읽음 처리, RecipientSelector 통합

## 수정할 파일

3. **`src/App.tsx`** — 라우트 추가
   ```
   <Route path="/docs/spare-part/:id" element={<DocsSparePartDetailPage />} />
   ```

4. **`src/pages/docs/DocsSparePartRawDataPage.tsx`**
   - `<TableRow>`에 `onClick={() => navigate('/docs/spare-part/' + r.id)}` + `cursor-pointer hover:bg-muted/50` 추가
   - `useNavigate` import

## DB 마이그레이션

5. 새 테이블 2개 (omm 패턴 1:1 복제)
   - **`spare_part_comments`** — `spare_part_id uuid → docs_spare_part(id) ON DELETE CASCADE`, `author_user_id`, `parent_comment_id`, `message`, `recipients text[]`, `type`, `edited`, timestamps
   - **`spare_part_comment_reads`** — `user_id`, `spare_part_id`, `last_read_at`
   - RLS: omm_comments / omm_comment_reads 와 동일 정책 (read=any authenticated, insert/update/delete=author 또는 admin/superuser)
   - 인덱스: `idx_spare_part_comments_sp(spare_part_id)`

## 범위 외 (이번 작업에 포함 안 함)

- Bulk action, Excel export, Raw Data 페이지 정렬/필터 강화
- Cycle progress, Stage funnel, Dashboard 위젯
- 알림(notification) 연동 — 추후 다른 모듈과 함께 일괄

## 기술 메모

- 권한: `can_write_for_team(uid, team)` 또는 `has_any_role(['admin','superuser','senior_user','user'])` — 기존 docs_spare_part RLS와 동일
- 변경 이력: `docs_change_log` (sub_module='spare_part', record_id=spare_part.id) — 기존 OMM 코드 재사용
- 타입: `supabase as any` 캐스트 사용 (자동 생성 타입은 마이그레이션 후 갱신됨)
