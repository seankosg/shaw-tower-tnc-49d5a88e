# New Slide Generator 일반 사용자화 계획

## 현재 문제

지금의 `SlideCodegen`은 결과로 **TypeScript 함수 코드**와 "ppt-builder.ts에 붙여넣고, slide-registry.ts에 등록하세요"라는 **개발자용 안내**를 보여줍니다. 코드를 모르는 사용자는:

1. `src/lib/ppt-builder.ts`를 직접 열 수 없음
2. `SLIDE_REGISTRY`에 항목을 추가할 줄 모름
3. Lovable 채팅에 파일을 업로드/교체하는 절차를 알아야 함
4. 빌드 에러가 나면 복구 불가

즉, 지금은 **개발자 보조 도구**일 뿐 일반 사용자용이 아닙니다.

## 제안: "Describe → Preview → Add" 3단계 자동화

코드 노출 없이, 자연어 → 미리보기 → 한 번의 "Add slide" 버튼으로 완결되는 흐름으로 바꿉니다.

### Step 1. Describe (지금과 비슷)
- Slide title, 삽입 위치, 데이터 소스 체크박스, 자연어 설명
- "Generate preview" 버튼

### Step 2. Preview (새로 추가)
- AI가 만든 슬라이드를 **실제 PPT 썸네일**(또는 단일 슬라이드 PPTX 다운로드 미리보기)로 렌더링
- "AI가 어떤 데이터를 썼는지" 한국어 요약 표시 (예: "T&C 진행률과 Defect Closure %를 좌우 비교 카드로 배치")
- 코드는 **숨김 처리** (Advanced에서만 열람 가능)

### Step 3. Add to report (새로 추가, 핵심)
사용자가 "Add to report" 한 번만 누르면 시스템이 자동으로:

1. 생성된 함수 코드를 Storage `code-files/ppt-builder.ts`의 끝에 **append** (Code Editor가 이미 쓰는 Storage 경로)
2. 새 슬라이드 키를 `ppt_slide_config` 테이블의 `slides` JSON 배열에 추가 (Slide Composer가 읽는 그 설정)
3. 사용자 화면에는 다음 안내만:
   > "슬라이드가 추가되었습니다. 적용을 완료하려면 Lovable 채팅에 'Storage의 ppt-builder.ts를 코드베이스에 동기화해주세요'라고 입력하세요."
   + 한 번의 클릭으로 위 문구를 클립보드 복사

이렇게 하면 사용자는 **코드 한 줄도 보지 않고** 슬라이드를 추가할 수 있고, 마지막 동기화 단계만 채팅에 붙여넣으면 됩니다.

### 추가 안전장치
- **Dry-run validation**: 생성된 코드가 TypeScript로 파싱 가능한지 Edge Function에서 사전 검증, 실패 시 사용자에게 친절한 메시지("AI가 만든 코드가 형식 오류라 다시 시도가 필요합니다") 표시
- **Undo**: 최근 추가한 슬라이드 1개를 한 클릭으로 제거 (Storage append를 되돌리고 `ppt_slide_config`에서 키 제거)
- **Slide Composer에 자동 반영**: 추가된 슬라이드가 Slide Composer 목록에 즉시 나타나 enable/순서 조정 가능

### Advanced (개발자용, 접힘)
- 생성된 함수 코드 보기/복사 (지금 화면)
- `SLIDE_REGISTRY` 등록용 스니펫 (수동 등록을 원하는 경우)

## 작업 범위 (technical)

수정 파일:
- `src/components/admin/SlideCodegen.tsx` — UI를 3단계 stepper로 재구성, 코드/등록 안내 영역을 Advanced collapsible로 이동, "Add to report" 버튼 추가
- `src/lib/slide-codegen.ts` — `addSlideToReport({functionCode, slideKey, slideLabel, position})` 함수 추가 (Storage append + `ppt_slide_config` upsert + `invalidateSlideConfigCache`)
- `supabase/functions/slide-codegen/index.ts` — 응답에 간단한 TS 파싱 검증 추가, 한국어 요약 필드(`summary`) 반환
- `src/lib/slide-config.ts` — 이미 존재. 그대로 사용

DB/Storage 변경: 없음 (기존 `ppt_slide_config` 테이블과 `code-files` 버킷 재사용)

미리보기(Step 2)는 두 가지 옵션:
- **A안 (간단)**: 사용자가 사용한 데이터 소스 + AI가 만든 한국어 요약 + 코드 길이만 표시
- **B안 (완전)**: 새 함수를 격리 환경에서 실제 실행해 1슬라이드 PPTX 생성 후 썸네일 변환

→ 1차 구현은 **A안**, B안은 후속 작업으로 보류 권장

## 결과물

일반 사용자 입장에서 흐름:
```
"T&C와 Defect 진행률을 비교하는 슬라이드 추가해줘"
  → Generate preview (한국어 요약 확인)
  → Add to report (자동 추가)
  → 안내문 복사 → Lovable 채팅에 붙여넣기 → 완료
```

코드 노출 0줄, 수동 파일 편집 0회.
