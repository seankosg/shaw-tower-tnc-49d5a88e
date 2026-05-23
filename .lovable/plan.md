## 목표
사이드바에 새로운 **Analysis** 그룹을 추가하고, 그 하위에 두 개의 탭(**DMR Raw Data**, **DMR Import**)을 만든다. Import는 업로드된 일일 출면 보고서(SUMMARY OF DAILY MANPOWER ON SITE) 이미지를 Lovable AI(Gemini Vision)로 파싱해 DB에 적재한다. Import 탭은 별도 탭으로 분리해 향후 다른 Analysis 항목 추가 시 재사용 가능한 구조로 만든다.

## 데이터 모델 (Lovable Cloud / Supabase)

새 테이블 `dmr_entries`:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| report_date | date | 보고서 우측 상단 일자 |
| team | text | 'Arch' / 'Mech' / 'Elec' |
| trade | text NULL | 'Façade', 'ACMV', 'PSG', 'FP', 'Elec', 'Lift' 등 |
| subcontractor | text | 업체명 (괄호 제거) |
| workplace | text | 'T&C' / 'Defect' / 'Post TOP' |
| manpower | int | '-' 또는 공백은 0 |
| source_image_path | text NULL | storage 경로 |
| created_by | uuid | auth.uid() |
| created_at, updated_at | timestamptz | |

- UNIQUE 제약: `(report_date, subcontractor, workplace)` — 중복 방지
- RLS: 인증 사용자 SELECT, `user` 이상만 INSERT/UPDATE/DELETE (기존 role gate 패턴)
- Storage bucket `dmr-uploads` (private) — 원본 이미지 보관

## 사이드바 변경 (`src/components/layout/AppSidebar.tsx`)

기존 그룹 아래에 새 그룹 추가:

```ts
const analysisNav = [
  { label: 'DMR Raw Data', icon: Database, path: '/analysis/dmr' },
  { label: 'DMR Import',   icon: Upload,   path: '/analysis/dmr/import' },
];
```

- 그룹 라벨: **Analysis**
- 표시 조건: `isAdmin || (인증된 user 이상)` — 기존 패턴 유지
- `role-permissions.ts`의 라우트 권한 매트릭스에 `/analysis/*` 추가

## 새 페이지 / 라우트

라우트 (`src/App.tsx`):
- `/analysis/dmr` → `AnalysisDmrRawDataPage`
- `/analysis/dmr/import` → `AnalysisDmrImportPage`

### 1) DMR Raw Data Page (`src/pages/analysis/DmrRawDataPage.tsx`)
- `dmr_entries`를 페이지네이션으로 조회하는 테이블
- 필터: 날짜 범위, Team, Subcontractor, Workplace
- 정렬: 기본 `report_date desc, team, subcontractor, workplace`
- 컬럼: Date / Team / Trade / Subcontractor / Workplace / Manpower / Source
- 일자별 합계 / Team별 Sub-Total 표시 (검산용)
- Excel 다운로드 버튼 (기존 `xlsx-js-style` 패턴 재사용)

### 2) DMR Import Page (`src/pages/analysis/DmrImportPage.tsx`)
업로드된 이미지에서 추출 → 미리보기 → 검증 → 저장하는 3단계 워크플로:

1. **Upload**: 이미지(JPG/PNG) 또는 PDF 한 장. Storage `dmr-uploads/{user_id}/{timestamp}.ext` 업로드.
2. **Parse (Edge Function `dmr-image-parse`)**: Lovable AI Gateway `google/gemini-2.5-pro` 호출. 시스템 프롬프트에 업로드된 매핑 표 전체(섹션→Team, 업체→Trade, '-'→0 규칙 등) 임베드. 결과는 strict JSON:
   ```json
   {
     "report_date": "2026-05-22",
     "sections": [
       { "team": "Arch", "rows": [{"company":"MERO","trade":"Façade","tnc":0,"defect":28,"post_top":0,"total":28}, ...], "sub_total":{"tnc":0,"defect":184,"post_top":0,"total":184} },
       ...
     ],
     "grand_total": {"tnc":60,"defect":231,"post_top":57,"total":348}
   }
   ```
3. **Validate & Preview**: 클라이언트에서 자동 검증
   - 행별: `tnc+defect+post_top == total`
   - Team별: rows 합 == Sub-Total
   - 전체: Sub-Total 합 == Grand Total
   - 중복: `(report_date, subcontractor, workplace)` 이미 존재 시 표시
   - 편집 가능한 테이블로 보여주고, 사용자가 셀 단위로 수정 가능. 검증 통과 셀은 초록, 실패 셀은 빨강.
4. **Commit**: 업체 1개당 3행(T&C, Defect, Post TOP) 으로 평탄화 후 `dmr_entries`에 일괄 INSERT. 중복은 사용자가 '덮어쓰기' / '건너뛰기' 선택.

업로드된 매핑 표(`DMR_매핑_프롬프트.md`)를 그대로 Edge Function 시스템 프롬프트로 인라인하여 LLM이 Team / Trade / Subcontractor 정규화(`Kurihara (ACMV)` → `Kurihara`+`ACMV`)와 '-'→0 변환을 수행한다.

## Edge Function
- `supabase/functions/dmr-image-parse/index.ts`
- 입력: `{ image_url | storage_path }`
- 출력: 위 JSON 구조
- `LOVABLE_API_KEY` 사용, 모델 `google/gemini-2.5-pro` (멀티모달 + 정확도)

## 권한 / 보안
- `/analysis/*`: super_guest 이상 SELECT, user 이상 import 가능 (기존 매트릭스에 맞춤)
- `dmr_entries` RLS:
  - SELECT: 인증 사용자
  - INSERT/UPDATE: user 이상 (`has_role`)
  - DELETE: senior_user 이상
- Storage `dmr-uploads` RLS: 본인 폴더만 read/write, admin은 전체

## 향후 확장
- Analysis 그룹은 그룹 라벨 + 메뉴만 추가하면 새 항목 (예: 'Cost Analysis', 'Productivity') 을 같은 패턴으로 붙일 수 있도록 nav 배열로 관리.
- Import 페이지는 `/analysis/dmr/import` 처럼 각 데이터셋별 전용 import 라우트를 분리해 두므로, 향후 항목별 import 페이지를 같은 트리에 추가하면 됨.

## 변경 파일 요약
- 신규: `src/pages/analysis/DmrRawDataPage.tsx`, `src/pages/analysis/DmrImportPage.tsx`
- 신규: `supabase/functions/dmr-image-parse/index.ts`
- 신규: DB 마이그레이션 (`dmr_entries` + RLS + storage bucket/policies)
- 수정: `src/components/layout/AppSidebar.tsx` (Analysis 그룹 추가)
- 수정: `src/App.tsx` (라우트 2개 추가)
- 수정: `src/lib/role-permissions.ts` (라우트 권한 매트릭스)
