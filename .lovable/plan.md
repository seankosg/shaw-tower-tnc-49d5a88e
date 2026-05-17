
# PPT Font Management & Bundled Download Plan

전체적으로 계획은 좋고 그대로 진행 가능합니다. 이전 논의에서 합의된 개선사항(가상 entry, family 묶음, 단일 버튼, 캐싱 등)을 반영한 최종 계획입니다.

---

## 1. Backend (Supabase)

### Storage
- `fonts` 버킷 (public) 생성
- MIME 허용: `font/ttf`, `font/otf`, `application/octet-stream`
- RLS: admin만 INSERT/DELETE, 모두 SELECT

### Table: `font_registry`
```
id              uuid PK
family_name     text       -- e.g. "Pretendard"
style           text       -- "Regular" | "Bold" | "Light" | ...
storage_path    text
public_url      text
language        text       -- "korean" | "english" | "mixed" (표시용 배지)
file_size_bytes bigint
is_default      boolean    -- 부분 UNIQUE INDEX로 1개만 허용
uploaded_by     uuid
uploaded_at     timestamptz
UNIQUE(family_name, style)
```
- **Malgun Gothic은 가상 entry** — 테이블 행 없음, 코드 상수로만 존재 (`builtin: true`)
- 삭제 보호 트리거: `is_default = true` 행 DELETE 차단

---

## 2. Admin UI — `FontLibrary.tsx` (Admin 탭 내 신규 섹션)

- family_name 으로 그룹화된 폰트 목록
- 각 family 카드: style 목록, language 배지, 총 파일 크기, default 토글
- 업로드: family_name + style + 파일 선택 (여러 style 한 번에 업로드 가능)
- 삭제: default 폰트는 차단
- Malgun Gothic은 표시만 되고 수정/삭제 불가

---

## 3. PPT Download UI — `PptExportCard.tsx` (Report 탭 내)

### Font Selection
- Radio 목록 (상단 고정: Malgun Gothic `default · Windows built-in`)
- 그 아래 font_registry 등록 폰트 family 단위로 표시
- 각 항목: `Pretendard (Korean · 4 styles · 4.2 MB)`

### Live Preview
- 선택 시 `@font-face` 동적 주입 + `document.fonts.load()` await
- 샘플 텍스트:
  ```
  SHAW TOWER · Completion Management
  87.6% · Pre-Test · 2026-06-15
  협조 요청 — 작성 필요
  ```
- 캐싱: `Map<family, ArrayBuffer[]>` 로 재선택 시 재fetch 방지

### 단일 Download 버튼
- 내부 분기:
  - **Malgun Gothic** → `.pptx` 단독 다운로드
  - **기타 폰트** → ZIP 패키징
- 다운로드 시작 직전 안내 Dialog:
  > **Font notice / 폰트 안내**
  > Original template font: `Malgun Gothic`
  > Selected font: `Pretendard` (4 styles, 4.2 MB)
  >
  > The ZIP contains the PPTX and font files.
  > Please install the fonts before opening the PPT.
  > 한글: ZIP 안의 폰트를 먼저 설치한 뒤 PPT를 여세요.
  >
  > [Cancel] [Download]

---

## 4. ZIP 구조

```
SHAW_Report_2026-05-17.zip
├── 1_INSTALL_FONTS_FIRST.txt   ← 파일명으로 강조 (한/영 병기)
├── SHAW_External_v4.pptx
└── fonts/
    ├── Pretendard-Regular.otf
    ├── Pretendard-Bold.otf
    ├── Pretendard-Light.otf
    └── Pretendard-SemiBold.otf
```

선택한 family의 **모든 style 파일 자동 포함** → pptxgenjs의 Bold/Regular 자동 매칭 보장.

---

## 5. 신규 파일

```text
src/lib/font-loader.ts        -- @font-face 주입 + 캐싱
src/lib/ppt-builder.ts        -- pptxgenjs 빌드
src/lib/ppt-bundler.ts        -- JSZip 패키징 + README 생성
src/components/admin/FontLibrary.tsx
src/components/report/PptExportCard.tsx
```

신규 마이그레이션: `font_registry` 테이블 + `fonts` 버킷 + RLS + 삭제 보호 트리거
신규 의존성: `pptxgenjs` (JSZip은 이미 존재)

---

## 6. 사용자 질문에 대한 답변 (재확인)

1. **Storage에 .ttf/.otf 저장** — ✅ 문제 없음 (public bucket + MIME 명시)
2. **ArrayBuffer fetch + JSZip 번들링** — ✅ 표준 패턴, 1~2초 내 생성
3. **개선사항** — 위 계획에 모두 반영 (가상 entry, family 묶음, 단일 버튼, 캐싱, install 파일명 강조, 안내 Dialog)

---

이 계획대로 진행해도 될까요? "Implement plan" 누르면 마이그레이션부터 시작합니다.
