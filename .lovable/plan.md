## 원인

업로드한 파일의 86줄 중 21줄이 `db_error: invalid input value for enum team_type: "Archi"` / `"MECH"` 사유로 거절됨.

- DB enum `team_type` 허용 값: `Mech`, `Elec`, `Arch`, `Supp`, `Design` (대소문자 구분).
- 파일에는 `MECH`, `Archi` 등이 들어 있음.
- T&C 표준 임포터(`src/lib/import-parser.ts`)에는 `normalizeTeam()`이 있어 `mech→Mech`, `arch→Arch` 등으로 변환하지만, **Punch 임포터(`src/lib/punch-excel-utils.ts`)는 team을 일반 텍스트로 그대로 DB에 넣음** (line 212-214 default 분기). 또한 `normalizeTeam`도 `archi`/`mecha` 같은 변형은 매핑 누락.

이 때문에 65줄(team 값이 우연히 맞거나 비어있는 줄)만 들어가고 나머지가 거절됨.

## 변경 사항

### 1) `src/lib/punch-excel-utils.ts` — team 정규화 추가

`parsePunchWorkbook` 안의 값 매핑 루프에서, `field.field === 'team'` 인 경우 별도 분기를 두고 새 헬퍼 `normalizePunchTeam(cell)`로 변환. 매핑 실패 시(빈/null/매핑 불가) 해당 필드를 비워둬서 DB enum 오류를 피하고, 동시에 파싱 단계에서 `errors`에 `Unknown team value: "<원본>"`을 push하여 사용자가 import 시작 전에 인지할 수 있게 함.

```ts
// 새 헬퍼 (파일 상단)
function normalizePunchTeam(val: unknown): string | null {
  if (val == null || val === '') return null;
  const key = String(val).trim().toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, string> = {
    mech: 'Mech', mecha: 'Mech', mechanical: 'Mech',
    elec: 'Elec', electrical: 'Elec', electric: 'Elec',
    arch: 'Arch', archi: 'Arch', architecture: 'Arch', architectural: 'Arch',
    facade: 'Arch',           // 파일명상 FACADE도 Arch로 묶임 — 필요시 별도 분기
    supp: 'Supp', support: 'Supp', supplier: 'Supp',
    design: 'Design', designer: 'Design',
    external: 'Supp',         // 외주/External — 임시 매핑, 확정 매핑은 아래 질문 참고
  };
  return map[key] ?? null;
}
```

루프 변경:
```ts
default: {
  if (field.field === 'team') {
    const t = normalizePunchTeam(cell);
    if (t) (values as any).team = t;
    // 매핑 실패 시 row 자체를 reject 처리할지 옵션
  } else {
    (values as any)[field.field] = String(cell).trim();
  }
}
```

### 2) `src/lib/import-parser.ts`의 `normalizeTeam`도 동일 보강

`mecha`, `archi`, `electric` 등 흔한 변형 추가 (T&C standard import에서도 동일 문제 재발 방지).

## 확인 필요

업로드 파일에 보이는 team 값에는 `MECH`, `Archi`, **`Facade`**, **`External`** 등 enum에 직접 매핑되지 않는 값이 있습니다. 임시안으로 `Facade→Arch`, `External→Supp`로 잡았지만, 실제 분류 규칙은 사용자만 알 수 있습니다. 구현 직전에 매핑을 확정하면 됩니다 (현재 plan으로 진행하시면 위 임시 매핑을 적용합니다).

## 검증

1. 동일 파일 재업로드 → 86줄 모두 inserted/updated, rejected 0 확인
2. team 값이 정말 비어있는 행은 NULL로 들어가는지 확인
3. 기존 정상 케이스(소문자 `mech` 등) regression 없는지 단위 동작 확인
