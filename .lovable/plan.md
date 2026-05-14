# Photo OCR 2-Pass 크롭 개선 계획

## 배경 / 문제

현재 흐름은 **1패스**입니다.
- 풀 스크린샷을 `defect-photo-ocr` 엣지 함수에 넘겨, 그룹별 `issue_no` + `caption_y_normalized`를 받음
- 클라이언트에서 `computeGroupBands()`로 caption Y 위·아래 일정 범위를 사진 영역으로 추정해 크롭
- 크롭한 썸네일은 검토용으로만 사용하고, **재OCR은 하지 않음**

문제: Vision 모델이 caption Y를 0.02~0.05 정도만 어긋나게 추정해도 사진이 절반쯤 잘리거나 옆 그룹 사진이 섞입니다. 실제로 이번에 개선했음에도 여전히 어긋나는 케이스가 보고되었습니다.

## 제안 — 2패스 구조

```text
[Pass 1]  풀 이미지 → "캡션 번호 위치만" 정밀 탐지
                ↓
            번호별 (issue_no, y_top, y_bottom) 목록
                ↓
       클라이언트에서 각 번호 위쪽 영역을 크롭
                ↓
[Pass 2]  크롭별로 다시 OCR → issue_no 재확인 + confidence 갱신
                ↓
          최종 reviewItems (이전과 동일한 UI/적용 흐름)
```

이로써:
- Pass 1은 "텍스트 검출"에 집중 → 좌표 정확도 ↑
- Pass 2는 좁은 영역에서 한 그룹만 다루므로 issue_no 신뢰도 ↑
- 크롭 좌표가 OCR이 실제로 본 번호의 bbox에 anchored 되므로 어긋남 최소화

## 변경 사항

### 1. 엣지 함수 `supabase/functions/defect-photo-ocr/index.ts`
- 시스템 프롬프트와 tool schema를 **번호 캡션 bbox 검출 전용**으로 교체
  - 반환: `captions: [{ issue_no, y_top, y_bottom, x_left, x_right, confidence, sender?, timestamp_text? }]`
  - 기존 `caption_y_normalized` 단일값 대신 **상·하단 Y**를 받아 크롭 정밀도 확보
- 응답 정렬/클램프 로직은 유지

### 2. 신규 엣지 함수 `supabase/functions/defect-photo-ocr-crop/index.ts`
- 입력: 단일 크롭 이미지 (data URL)
- 출력: `{ issue_no, caption_raw, confidence }` (단일 그룹 가정)
- Pass 1과 동일한 Lovable AI Gateway 호출, 단 프롬프트/스키마는 "이 한 장에서 가장 큰 숫자 캡션 하나만" 추출하도록 단순화
- 동일한 인증/CORS/에러 패턴 (429/402 surface)

### 3. `src/lib/defect-photo-ocr.ts`
- `OcrGroup` 필드를 `caption_y_normalized` → `{ y_top, y_bottom, x_left?, x_right? }`로 확장 (기존 필드는 호환을 위해 옵셔널 유지)
- `computeGroupBands()` 재작성:
  - 입력이 `{ y_top, y_bottom }[]`일 때는 그 bbox 위쪽으로 maxPhotoHeight 만큼 사진 영역으로 잡고, 위쪽은 직전 캡션의 `y_bottom + gap`까지만 확장
  - 입력이 단일 Y만 있을 때는 현재 로직으로 fallback
- `callPhotoOcrCrop(dataUrl)` 헬퍼 추가 → 새 엣지 함수 호출
- 단위 테스트(`src/test/defect-photo-ocr.test.ts`)에 bbox 입력 케이스 추가

### 4. `src/contexts/PhotoOcrContext.tsx` — `runParse` 흐름
1. `compressForOcr(file)` → 풀 이미지 dataURL
2. `callPhotoOcr(full)` → Pass 1 캡션 목록
3. `computeGroupBands(captions)` → 그룹별 사진 bbox
4. 각 bbox에 대해 `cropFromDataUrl(full, bbox)` → 크롭 dataURL
5. `callPhotoOcrCrop(crop)` 직렬 호출 (Pass 2)
   - 결과의 issue_no가 Pass 1과 다르면 confidence 더 높은 쪽 채택, 노트로 표시
   - confidence는 Pass 2 값으로 갱신
6. 기존 reviewItem과 동일한 형태로 state 업데이트
- 기존 `parseProgress`는 (file, step) 단위로 표시되도록 단계 표기 보강 ("OCR 3/12 · crop 2/4")
- 백그라운드 유지·sidebar 배지·beforeunload 가드 등 전 작업물 그대로 유지

### 5. UI `src/components/import/PhotoOcrPanel.tsx`
- 변경 없음 (썸네일은 이미 크롭된 사진을 보여주고 있어 그대로)

## 기술 노트

- Pass 2가 추가되어 그룹 N개당 AI 호출이 1 + N 이 되므로 **레이트 리밋/비용 영향**이 있습니다. 한 스크린샷당 평균 4~6 그룹이라 가정하면 호출 5~7배. 필요하면 향후 batching/낮은 모델(`gemini-2.5-flash-lite`) 사용으로 비용 최적화 가능.
- Pass 1은 좌표 정밀도가 중요하므로 `gemini-2.5-pro` 유지, Pass 2는 빠르고 저렴한 `gemini-2.5-flash` 사용을 기본값으로 (사용자 설정 없이 코드에 명시).
- 기존 `caption_y_normalized` 단일값 응답을 받는 구버전 캐시/로직은 fallback으로 호환.

## 검증

- `bunx vitest run src/test/defect-photo-ocr.test.ts` — bbox 기반 band 계산 신규 케이스 통과 확인
- 실제 WhatsApp 스크린샷 1장으로 수동 테스트:
  - 썸네일이 각 번호에 매칭되는 사진 영역만 정확히 보이는지
  - issue_no 누락/혼동 없는지
  - 다른 메뉴 이동 시 백그라운드 진행 유지 (기존 동작 회귀 없음)

## 영향 범위

- 변경: `supabase/functions/defect-photo-ocr/index.ts`, `src/lib/defect-photo-ocr.ts`, `src/contexts/PhotoOcrContext.tsx`, `src/test/defect-photo-ocr.test.ts`
- 신규: `supabase/functions/defect-photo-ocr-crop/index.ts`
- DB/마이그레이션 변경 없음, RLS 변경 없음
