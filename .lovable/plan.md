
# 목표

Admin → Field Configuration → OMM 탭에서 `docs_field_config` 행을 수정/추가/삭제하면, **OMM Raw Data 페이지가 새로고침 없이 즉시 반영**되도록 합니다 (컬럼 visible, 라벨, sort_order, required 등). 같은 메커니즘으로 ABD/Warranty/Spare Part Raw Data도 자동으로 혜택을 봅니다.

# 변경 사항

## 1) DB 마이그레이션 — realtime publication 등록

`docs_field_config` 테이블을 Supabase realtime publication에 추가합니다 (현재 미등록 상태 확인됨).

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.docs_field_config;
```

선택적으로 같은 마이그레이션에서 자매 테이블도 함께 등록해 일관성 확보:
- `public.field_config` (T&C)
- `public.defect_field_config` (Defect)

이렇게 하면 향후 T&C/Defect Raw Data에도 동일 패턴을 쉽게 적용할 수 있습니다. (이미 등록돼 있으면 `IF NOT EXISTS` 가드를 위해 `DO $$ ... $$` 블록으로 감쌉니다.)

## 2) `useDocsFieldConfig` 훅에 realtime 구독 추가

`src/hooks/useDocsFieldConfig.ts`:

- 기존 1회성 fetch는 그대로 유지.
- `useEffect` 내부에서 `supabase.channel('docs-field-config-{subModule}')` 채널을 만들고 `postgres_changes` (event `*`, table `docs_field_config`, `filter: sub_module=eq.{subModule}`) 를 구독.
- 어떤 변경이든 들어오면 다시 전체 행을 fetch하여 `setFields`로 갱신 (행이 적기 때문에 부분 머지보다 단순 refetch가 안전·정확).
- 언마운트 시 `supabase.removeChannel(channel)`로 정리.
- 채널 이름에 `subModule`을 포함시켜 같은 페이지에 여러 sub_module이 마운트돼도 충돌이 없도록 합니다.

이 훅은 OMM 외에도 ABD/Warranty/Spare Part Raw Data 페이지에서 이미 사용 중이므로, **한 번 수정하면 네 페이지 모두 자동 적용**됩니다.

## 3) (선택, 짧은 추가) Admin Field Config 편집기에서도 같은 채널을 듣도록

`src/pages/AdminPage.tsx`의 `FieldConfigTable` 내부 fetch 로직에도 동일한 realtime 구독을 추가하면, 두 명의 관리자가 동시에 편집하는 시나리오에서도 화면이 자동 동기화됩니다. (Out of scope로 둬도 핵심 요청은 충족됩니다 — 사용자가 원하면 같이 진행, 아니면 생략.) → **포함하겠습니다.** 마이너 변경이라 노이즈가 거의 없습니다.

# 검증 방법

1. Admin → Field Config → OMM 탭에서 임의 필드의 "Visible" 토글 또는 라벨을 수정.
2. 다른 탭/창에서 OMM Raw Data 페이지를 열어둔 채로 1초 이내에 컬럼이 사라지거나 라벨이 바뀌는지 확인.
3. ABD Raw Data에서도 같은 동작이 되는지 확인 (보너스).

# 영향 범위 / 비목표

- 영향: `docs_field_config`를 사용하는 4개 Raw Data 페이지 + Admin Field Config 화면.
- 비목표: `import_header_mappings`(헤더 매핑) realtime, T&C/Defect Raw Data realtime 적용, `field_config` 행 자체의 RLS/스키마 변경, Header Mapping ↔ Field Config 사이의 추가 비즈니스 동기화 로직.
