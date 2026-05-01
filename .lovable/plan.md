## 목표

별도의 `/docs/org-mapping` 페이지를 제거하고, **Admin → Subcontractor Master** 안에서 Aconex Organisation Alias를 인라인으로 관리합니다. Docs Import는 미매칭 라벨을 자동으로 `docs_org_alias` 큐에 적재해 Admin에서 한 곳에서 처리하도록 합니다.

## 변경 사항

### 1. Admin → Subcontractor Master 확장

`src/pages/AdminPage.tsx` 안의 Subcontractor Master 카드/테이블을 확장합니다.

- 각 협력사 행에 **Aconex Aliases** 컬럼 추가
  - 매핑된 `docs_org_alias.raw_label` 들을 제거 가능한 Badge(chip)로 표시
  - "+ Add alias" 버튼 → 작은 다이얼로그로 raw label 직접 입력 추가
  - chip의 X 클릭 → 해당 alias soft delete (`is_active=false`) 또는 hard delete
- 카드 하단에 **Unmapped Aliases** 섹션
  - `docs_org_alias` 중 `subcontractor_id IS NULL` 인 항목 목록
  - 각 행에 "Map to ..." Select(활성 협력사 목록) + Save 버튼
  - "Ignore" 버튼 → `is_active=false` 로 큐에서 숨김
  - 카운트 Badge를 카드 헤더에도 표시

### 2. Docs Import의 자동 큐잉

`src/contexts/DocsImportContext.tsx` 의 import 종료 시점에:

- `counters.unmatched` 의 라벨들을 `docs_org_alias` 에 `subcontractor_id=null, is_active=true` 로 **upsert** (`onConflict: raw_label`)
- import 완료 토스트에 미매칭 카운트 + "Resolve in Admin →" 액션 링크
- `DocsImportPage.tsx` 의 Unmatched Orgs 알림에 **"Manage in Admin"** 버튼 (Admin 탭으로 이동)

### 3. 라우트 / 사이드바 정리

- `src/App.tsx` 에서 `/docs/org-mapping` 라우트 제거
- `src/components/layout/AppSidebar.tsx` Docs 섹션의 "Org Mapping" 항목 제거
- `src/pages/docs/DocsOrgMappingPage.tsx` 삭제

### 4. DB 변경

`docs_org_alias.raw_label` 에 UNIQUE 제약이 있어야 자동 upsert가 안전합니다. 마이그레이션:

```sql
-- 중복 정리 후
ALTER TABLE public.docs_org_alias
  ADD CONSTRAINT docs_org_alias_raw_label_key UNIQUE (raw_label);
```

(이미 존재한다면 no-op 처리)

## 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `src/pages/AdminPage.tsx` | Subcontractor Master에 Alias chip / Unmapped 섹션 추가 |
| `src/contexts/DocsImportContext.tsx` | import 종료 시 미매칭 라벨 자동 upsert |
| `src/pages/docs/DocsImportPage.tsx` | Unmatched Orgs 알림에 Admin 이동 링크 |
| `src/App.tsx` | `/docs/org-mapping` 라우트 제거 |
| `src/components/layout/AppSidebar.tsx` | Docs 섹션 Org Mapping 메뉴 제거 |
| `src/pages/docs/DocsOrgMappingPage.tsx` | 삭제 |
| 신규 마이그레이션 | `docs_org_alias.raw_label` UNIQUE 제약 |

## 권한

- `docs_org_alias` 의 기존 RLS (admin/superuser만 변경) 그대로 사용
- Admin 페이지는 이미 admin/superuser 가드가 있으므로 추가 가드 불필요

## 범위 외 (다음 단계 후보)

- Dashboard 위젯 (RAG 카운터 / discipline 차트)
- Drawing Detail 본격 구현 (편집 + 변경 이력 패널)

승인하시면 이 통합안으로 바로 구현하겠습니다.
