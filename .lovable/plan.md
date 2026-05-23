## 점검 결과 — 현재는 동일 문제 재발

이미지 Import 경로를 추적해 보면:

1. **Edge function 프롬프트** (`supabase/functions/dmr-image-parse/index.ts`, 28번 줄)
   ```
   Construction fixed trades: MERO -> "Façade".
   All other Construction companies -> trade=null.
   ```
   → AI가 Arch 그룹(GRB, Microtac, SYS, ACU, NEE LEE 등 13개 sub)의 `trade`를 **null**로 반환합니다.

2. **Frontend `flatten()`** (`DmrImportPage.tsx`, 107~109번 줄)
   ```ts
   trade: r.trade ?? null
   ```
   → 받은 null을 그대로 DB에 INSERT.

결과적으로 **이미지 Import 시에도 Arch sub들은 `trade = NULL`로 저장**되어, 방금 우리가 보정한 909행과 똑같이 비게 됩니다.

## 변경

엑셀과 동일하게 모든 행이 Trade를 갖도록 두 곳을 보완합니다. DB 스키마/마이그레이션 변경 없음.

### 1. Edge function 프롬프트 보강

`supabase/functions/dmr-image-parse/index.ts`의 SYSTEM_PROMPT를 수정:

- 기존: "All other Construction companies -> trade=null"
- 변경: **"All other Construction companies -> trade='Arch'"**
- Mechanical/Electrical 규칙은 이미 회사명에 `(...)` 또는 고정 매핑(PureTech→Elec, Schindler Lift→Lift)으로 채워지므로 그대로 유지.

이렇게 하면 AI가 한 번에 올바른 trade를 채워줍니다.

### 2. Frontend `flatten()` 안전망

AI가 어떤 이유로든 trade를 비워서 보내더라도 DB에 NULL이 들어가지 않도록 fallback 매핑을 추가:

```ts
const TRADE_FALLBACK_BY_TEAM = { Arch: 'Arch', Mech: 'Arch', Elec: 'Arch' };
const TRADE_BY_SUB: Record<string, string> = {
  MERO: 'Façade', Mero: 'Façade',
  PureTech: 'Elec', Puretech: 'Elec',
  'Schindler Lift': 'Lift', SCHINDLER: 'Lift',
  ASK: 'PSG', RICO: 'FP',
  Kurihara: 'ACMV', 'Kurihara (ACMV)': 'ACMV',
};
// flatten 안에서:
const trade = r.trade ?? TRADE_BY_SUB[r.subcontractor] ?? (s.team === 'Arch' ? 'Arch' : null);
```

(Mech/Elec sub는 위 매핑으로 대부분 결정되고, 신규 sub가 들어오면 사용자가 Verify 화면에서 직접 입력하는 경로가 이미 있으므로 fallback은 Arch 그룹에만 강제 적용)

### 3. 검증 방법

- 새 이미지 1장 업로드 → Verify 화면에서 모든 row의 Trade가 채워져 있는지 육안 확인
- Save 후 `SELECT trade, count(*) FROM dmr_entries WHERE source_image_path IS NOT NULL GROUP BY trade` 로 NULL 0개 확인

## 영향 범위

- 코드 2개 파일(edge function 1, 프론트 1)만 수정
- DB / 스키마 / 기존 데이터 무변경
- 기존 909행은 이미 직전 단계에서 보정 완료