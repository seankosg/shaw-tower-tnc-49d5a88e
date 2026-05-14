# Photo OCR Import 기능 구현 계획 (v2 — WhatsApp 스크린샷 대응)

Defect Import 탭에 "Photo OCR" 모드를 추가합니다. Kurmar(mep) 같은 현장 인원의 **WhatsApp 채팅 스크린샷**을 통째로 업로드하면, AI 비전 모델이 스크린샷 안의 모든 (사진그룹 + 숫자 캡션) 쌍을 인식해 Issue No를 추출하고, 매칭되는 defect의 Actual Start/Completion Date를 Data Date로, Aconex Comments에 "Verified by HDEC"를 채웁니다. 사진은 시스템에 저장하지 않습니다.

## 1. 입력 형태 — WhatsApp 스크린샷 우선

샘플 분석 결과, 사용자는 보통 다음을 업로드합니다:
- **WhatsApp 채팅 스크린샷 (세로로 긴 이미지)** — 한 장에 여러 Issue 묶음 포함
- 각 묶음 = `보낸사람 헤더` + `사진 콜라주 (1~6장, "+N" 더보기 표시 가능)` + `숫자 캡션 (예: 2125)` + `시간 (예: PM 2:42)`
- 다른 사람의 답장/포워딩 미리보기 블록은 같은 화면에 섞여 있을 수 있음 → 제외 필요
- 드물게 "2221 - Defect / Light panel..." 같이 텍스트 설명이 붙는 경우도 있음

따라서 OCR은 단순 숫자 추출이 아닌 **그룹 단위 파싱**이 필요합니다.

## 2. UI 구조

### Import 페이지 모드 토글
`DefectImportPage` 상단에 모드 탭:
- **Excel Import** (기존)
- **Photo OCR** (신규)

라우트는 `/defects/import` 그대로 사용, 내부 state로 분기. 사이드바에는 새 항목 추가 안 함.

### Photo OCR 모드 화면

1) **Header bar**
   - Data Date picker (기본: 오늘) — 모든 업데이트에 일괄 적용
   - 안내 문구: "Aconex Comments will be set to: Verified by HDEC"
   - Drop zone / "Select Screenshots" 버튼 (jpg/jpeg/png, 다중 선택, HEIC는 차단 안내)

2) **업로드 패널 — 두 단계로 진행**

   **Step 1: Parse**
   - 각 업로드 파일에 대해 비전 모델이 스크린샷을 분석
   - 추출 결과 = `extractedGroups: [{ issueNo, captionText, confidence, cropHintBox }, ...]`
   - 진행률 표시 (파일별)

   **Step 2: Review & Apply**
   - 모든 파일에서 추출된 그룹들을 평탄화하여 **Issue 리스트 그리드**로 표시
   - 각 행: `[원본 파일 thumbnail · 그룹 영역 미리보기(crop) · Issue No · DB 매칭 상태 · 결정 액션]`
   - 매칭 상태:
     - `Will update` (DB에 존재 + actual_completion_date 비어 있음)
     - `Skip — already completed` (이미 완료)
     - `Not found` (DB에 없음)
     - `Needs review` (confidence 낮음 / 캡션 모호)
     - `No permission` (D.Super User가 다른 team의 row를 선택한 경우)
   - 각 행 액션: `Edit Issue No` (수동 수정), `Skip`, `Re-include`
   - 일괄 액션: `Apply All`, `Apply Selected`, `Clear`

3) **Needs Review 패널**
   - confidence < 0.7 또는 미매칭 항목을 모아 표시
   - 사진 옆 입력란에 Issue No 직접 입력 → `Apply`

4) **결과 요약 카드**
   - Updated N · Skipped(이미 완료) N · Not found N · Manual N · Failed N
   - "View change log" 링크로 import logs 페이지 이동

## 3. OCR 처리 — Edge Function `defect-photo-ocr`

신규 edge function:
- 입력: 단일 이미지 (base64 data URL) + dataDate
- 모델: **`google/gemini-2.5-pro`** — 멀티 객체/긴 스크린샷 + 한국어 UI + 숫자 인식 모두 강함 (gemini-2.5-flash로 시작했다 정확도 부족하면 pro로 폴백 옵션)
- Tool calling으로 구조화 출력 강제:
  ```json
  {
    "groups": [
      {
        "issue_no": "2125",
        "caption_raw": "2125",
        "sender": "Kumar(mep)",
        "timestamp_text": "PM 2:42",
        "confidence": 0.0~1.0,
        "bbox_normalized": { "x": 0, "y": 0.05, "w": 1, "h": 0.18 },
        "notes": "string (모호한 점)"
      }
    ],
    "rejected_blocks": [
      { "reason": "reply preview / different sender", "y_range": [0.6, 0.75] }
    ]
  }
  ```
- 시스템 프롬프트 요지(영문):
  - "This is a WhatsApp chat screenshot. Find every message group sent by 'Kumar(mep)' (or similar mep/elec field staff). Each group has photos followed by a numeric caption (1–5 digits). Return one entry per group with the numeric caption as `issue_no`. Ignore reply previews, forwarded link cards, and messages from other senders. If a group has a non-numeric caption like 'Defect 2221 - ...', extract the leading number."
  - "If a caption is unreadable or ambiguous, set confidence < 0.5 and still include it so a human can review."
- 신뢰도 < 0.7 → Needs Review로 분류
- bbox_normalized은 클라이언트가 원본 이미지를 crop해서 리뷰 UI에 미리보기로 표시하기 위함 (저장 안 함, 메모리 canvas)
- 429 / 402 에러는 그대로 클라이언트 → 토스트
- 사진은 함수 내에서만 사용, storage / log에 일절 저장하지 않음

## 4. 매칭 & 업데이트 (클라이언트 → Supabase)

`Apply` 클릭 시 각 그룹별로:

1. `defect_items` 조회: `issue_no = ?` AND `is_active = true` AND `project_id = currentProject`
2. 분기:
   - **없음** → `Not found`
   - **`actual_completion_date` 이미 채워짐** → `Skipped — already completed`
   - **그 외** → 업데이트 실행:
     ```
     actual_start_date = (기존 값 있으면 유지, 없으면 dataDate)
     actual_completion_date = dataDate
     aconex_comments = (기존 코멘트가 있으면) "${existing}\n[${dataDate}] Verified by HDEC"
                       (없으면) "Verified by HDEC"
     updated_by = auth.uid()
     row_version = row_version + 1
     ```
3. `defect_change_log`에 변경 이력 기록 (`change_source = 'photo_ocr'`, 필드별 row 1개씩)
4. 모든 업데이트 완료 후 `recompute-defect-status` edge function 1회 호출 → `closure_status` / `completion_status` / `progress_pct` 자동 갱신
5. 추적용 `defect_upload_batches` 1행 생성 (`uploaded_file_name = 'photo_ocr_<timestamp>'`, `data_date = dataDate`, 통계 기록) → 기존 Import Logs 페이지에서 가시화

## 5. 권한 & 모듈 상태

- 기존 Import 페이지와 동일: `useModuleStatus().defect.enabled` + admin bypass
- Write 권한은 RLS가 자동 적용:
  - user / senior_user / superuser / admin → 전체
  - d_superuser → 본인 team의 row만 (RLS에서 거부 시 결과 = `Failed (no permission)`)
- 권한 거부된 행은 결과 요약에 별도 카운트

## 6. 데이터 / 스키마 변경

DB 스키마 변경 **없음**. 재사용:
- `defect_items` 컬럼: `actual_start_date`, `actual_completion_date`, `aconex_comments`, `updated_by`, `row_version`
- `defect_change_log` (`change_source` 새 값 `photo_ocr`)
- `defect_upload_batches` (트래킹용)

## 7. 파일별 작업

### 신규
- `supabase/functions/defect-photo-ocr/index.ts` — Vision OCR (Lovable AI Gateway, gemini-2.5-pro, tool calling)
- `src/lib/defect-photo-ocr.ts` — 클라이언트 헬퍼: 이미지 base64 변환, edge function invoke, bbox crop 미리보기 생성, 매칭/업데이트 트랜잭션
- `src/components/import/PhotoOcrPanel.tsx` — Photo OCR 메인 UI (업로드 + Parse + Review + Apply)
- `src/components/import/PhotoOcrGroupRow.tsx` — 추출된 그룹 1행 (썸네일/crop preview/issue/상태/액션)
- `src/components/import/PhotoOcrManualEntry.tsx` — Needs Review 수동 입력 다이얼로그

### 수정
- `src/pages/DefectImportPage.tsx` — 상단 모드 토글, Photo OCR 모드 분기
- `src/contexts/DefectImportContext.tsx` — `change_source` 상수에 `photo_ocr` 추가 (그 외 photo state는 PhotoOcrPanel 내부 격리)

## 8. 에러 / 엣지 케이스

- HEIC: 브라우저에서 디코드 불가 → "Convert HEIC to JPG/PNG" 토스트
- 매우 긴 스크린샷(예: 5000px 이상): 클라이언트에서 자동으로 4000px 단위로 분할해서 함수에 순차 호출 → 그룹 결과 병합
- 단일 파일 최대 15MB, 큐 최대 30장 (rate limit 보호)
- OCR 동시 호출 = 2건 (queue) — 429 방지
- 부분 실패 허용: Apply 단계는 그룹 단위 트랜잭션, 한 건 실패가 전체 막지 않음
- 사진은 메모리에서만 보유, Apply 종료 또는 Clear 시 `URL.revokeObjectURL`로 즉시 해제
- 다른 발신자 블록(예: Rajalingalm(PT) 답장)은 모델이 `rejected_blocks`로 보고 → 클라이언트가 결과 요약에 "Other-sender blocks ignored: N" 표시

## 9. 검증 계획

- TypeScript 빌드 무오류
- 단위 테스트: `src/test/defect-photo-ocr.test.ts`
  - `decideUpdate(existing, dataDate)` — 5가지 분기 (없음/완료됨/start만 비어있음/coments append/append 없음)
  - `mergeAconexComment(existing, dataDate)` — 줄바꿈 append 규칙
- 수동 QA 시나리오 (업로드된 두 샘플 사용):
  1. 정상 스크린샷 → 5~6개 그룹 모두 인식, 각 Issue No 매칭
  2. 답장 미리보기 섞인 스크린샷 → 답장 블록 무시
  3. "+3" 더보기 콜라주 → 캡션 숫자만 정확히 인식
  4. 이미 완료된 issue 포함 → Skipped로 표시
  5. 존재하지 않는 issue (예: 9999) → Not found, 수동 수정 후 Apply
  6. D.Super User가 타 team issue 처리 시 → Failed (no permission)
