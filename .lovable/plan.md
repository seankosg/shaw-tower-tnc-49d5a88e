

## "Sub-Sub" 표시명 통일 + Import 헤더 매핑 보강

### 1. UI 표시명 변경: `SubSub` → `Sub-Sub`
사용자 노출 텍스트만 교체. 코드 식별자(`subsub_name`, `type='subsub'`, 변수명)는 변경하지 않음.

| 파일 | 위치 | 변경 |
|------|------|------|
| `src/pages/SubtestDetail.tsx` | L351 Label | `SubSub` → `Sub-Sub` |
| `src/pages/MobileUpdatePage.tsx` | L179 label | `SubSub` → `Sub-Sub` |
| `src/pages/ExportPage.tsx` | L62 Excel 헤더 키 | `'SubSub'` → `'Sub-Sub'` |
| `src/pages/AdminPage.tsx` | 여러 곳 (Users 다이얼로그 라벨, Masters 섹션 헤더, placeholder, toast 메시지) | `SubSub` → `Sub-Sub` (단, 라디오값/변수명/state명은 그대로) |
| DB `field_config.display_name` | `'SubSub'` → `'Sub-Sub'` | 마이그레이션 1줄 UPDATE |

### 2. Import 헤더 매핑 보강 (`src/lib/import-parser.ts`)
사용자 명시 컬럼명 `Sub-Subcontractor` 와 변형들을 `HEADER_MAP`에 추가:

```ts
'sub-subcontractor': 'subsub_name',
'sub subcontractor': 'subsub_name',
'subsubcontractor': 'subsub_name',
'sub_subcontractor': 'subsub_name',
'sub-sub contractor': 'subsub_name',
'sub-sub-contractor': 'subsub_name',
```

기존 매핑(`sub-sub`, `subsub`, `sub sub`, `sub_sub`, `subsub_name`, `subsub name`, `sub-sub name`)은 유지 → **컬럼 순서가 Subcontractor와 HDEC PIC 사이라면 어떤 표기든 인식**.

### 3. 매핑 검증 흐름 (코드 변경 없음, 기존 로직 재확인)
- `parseExcelFile()`: 헤더 행을 `normalizeHeader()` 통과 → 소문자 + 공백 정규화 후 `HEADER_MAP` 조회 → 키 `subsub_name`로 통일
- `parseLegacy` / `parseStandard`: `row.subsub_name?.trim() || null` 로 추출 → `ParsedSubtest.subsub_name`
- `ImportContext`: insert payload + update 필드 배열에 `subsub_name` 포함 (이미 적용됨)
- → **엑셀 헤더가 "Sub-Subcontractor"든 "Sub-Sub"든 모두 동일한 컬럼으로 매핑됨** ✓

### 변경 파일 요약
| 파일 | 변경 |
|------|------|
| `src/lib/import-parser.ts` | HEADER_MAP에 6개 alias 추가 |
| `src/pages/SubtestDetail.tsx` | Label 1곳 |
| `src/pages/MobileUpdatePage.tsx` | label 1곳 |
| `src/pages/ExportPage.tsx` | Excel 헤더 키 1곳 |
| `src/pages/AdminPage.tsx` | 사용자 노출 텍스트 ~6곳 |
| 신규 migration | `UPDATE field_config SET display_name='Sub-Sub' WHERE field_name='subsub_name'` |

### 사용자 시나리오
1. 엑셀 헤더가 `Sub-Subcontractor` (또는 `Sub-Sub`, `SubSub` 등) → import 시 `subsub_name`으로 자동 인식
2. SubtestDetail / Mobile / Export / Admin 모든 화면에서 라벨이 "Sub-Sub"로 통일 표시
3. 코드 변경은 표시 텍스트만이라 회귀 위험 최소

