## 원인

Punch 모듈에서 Admin과 Import 파서의 헤더 별칭(alias) 정규화 규칙이 서로 다릅니다.

- **Admin 저장 시** (`HeaderMappingsTab.tsx` `normalizeAlias`): `lowercase` + **모든 비-영숫자 제거**
  → "Main Cat" 입력 시 DB에는 `maincat` 으로 저장됨
- **Import 조회 시** (`punch-excel-utils.ts` `normalizeAliasForLookup`): `lowercase` + 공백만 정리(공백 유지)
  → 엑셀 헤더 "Main Cat" 은 `main cat` 으로 조회 → DB의 `maincat` 과 매칭 실패

DB 확인 결과:
- `import_header_mappings(module=punch)` 에 `maincat → category1`, `subcat → category2` 가 활성 상태로 존재
- 업로드 파일 헤더는 `Main Cat`, `Sub Cat` (사이 공백 있음)
- 정규화 차이로 `Main Cat`/`Sub Cat` 두 개만 매핑되지 않아 22개 중 20개만 mapped 상태

## 해결 방안

Punch 한정으로 Import 조회 정규화를 Admin 저장 정규화와 동일하게 맞춥니다 (한 줄 수정).

### 수정 파일
**`src/lib/punch-excel-utils.ts`** — `normalizeAliasForLookup` 를 Admin과 동일한 규칙으로 변경:
```ts
function normalizeAliasForLookup(raw: string): string {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
```
이후 "Main Cat", "main-cat", "Main_Cat" 등 모든 변형이 `maincat` 으로 일치되어 DB 별칭과 매칭됩니다.

### 검증
1. Punch Import 화면에서 동일 파일 재업로드 → `22/22 cols mapped` 확인
2. Unmapped columns 안내에서 `Main Cat`, `Sub Cat` 사라지는지 확인
3. Raw Data 페이지에서 `Category 1` (건축), `Category 2` (A&A 등) 컬럼 값이 채워졌는지 확인

### 영향 범위
- Punch 모듈 전용 함수만 수정 — TNC / Defect / Docs 파서에는 영향 없음
- 기존에 매칭되던 `maincat`, `subcat`, `category1`, `구분1` 등은 모두 그대로 정규화 후 일치하므로 회귀 없음
