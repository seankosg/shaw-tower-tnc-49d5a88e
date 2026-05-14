## 문제 진단

- OCR이 읽어내는 issue_no 자체는 정확합니다 (사용자 확인). 어긋나는 건 **각 review row 옆의 thumbnail crop**입니다.
- 현재 `cropFromDataUrl()`는 모델이 반환한 `bbox_normalized`(group 전체 영역)를 그대로 사용합니다.
- WhatsApp UI에서 한 그룹 = 헤더(보낸사람) + 사진 콜라주 + 캡션 + 시간 입니다. Gemini가 이 4개 요소가 모두 들어간 박스를 group마다 반환하는데, **두 번째 그룹부터는 박스가 위쪽 그룹의 캡션 영역까지 침범**하는 식으로 한 칸씩 밀리고 있습니다. 이는 비전 모델의 bbox 좌표 정확도 한계(특히 세로로 긴 스크린샷)에서 흔한 현상입니다.
- 결국 "번호는 맞는데 썸네일은 다음 그룹의 사진을 보여주는" 형태가 됩니다.

## 해결 방향

bbox에 의존하지 않고, **OCR 결과를 위→아래 순서로 신뢰**하되 client에서 직접 썸네일 영역을 결정합니다.

### 1) Edge function — bbox 대신 caption_y_normalized 만 받기

`supabase/functions/defect-photo-ocr/index.ts` 시스템 프롬프트와 tool schema 변경:

- 출력에서 `bbox_normalized` 제거.
- 새 필드 `caption_y_normalized: number (0..1)` — **숫자 캡션 텍스트의 세로 중심 위치**만 추정해서 반환 (모델이 가장 정확하게 짚을 수 있는 단일 좌표).
- groups 배열은 반드시 **세로 순서(위→아래)**로 정렬된 상태로 반환하도록 명시.

이 한 점만 받으면 클라이언트가 인접 그룹과의 중간선을 이용해 안정적으로 그룹 영역을 산출할 수 있습니다.

### 2) Client — caption y 사이의 중간선으로 그룹 band 자동 산출

`src/lib/defect-photo-ocr.ts`에 새 헬퍼:

```text
computeGroupBands(captionYs: number[], imageHeightPx, padTop=0.06, padBottom=0.02)
  -> Array<{ yTop, yBottom }>  // normalized
```

규칙:
- `top[i]`  = (`captionY[i-1]` + `captionY[i]`) / 2  (첫 그룹은 max(0, captionY[0]-0.18))
- `bottom[i]` = (`captionY[i]` + `captionY[i+1]`) / 2  (마지막 그룹은 min(1, captionY[i]+0.04))
- 결과는 인접 그룹 간 영역이 **겹치지 않게** 자동 분할되므로, 모델 bbox가 한 칸 밀려도 영향 없음.

`cropFromDataUrl`은 그대로 두고 위 band의 `{ x:0, y:yTop, w:1, h:yBottom-yTop }`을 넘겨 잘라냅니다.

### 3) PhotoOcrPanel — 새 좌표 시스템 사용

`src/components/import/PhotoOcrPanel.tsx`:
- `OcrGroup` 타입의 `bbox_normalized` 자리에 `caption_y_normalized?: number` 사용 (또는 둘 다 받되 caption_y 우선).
- parse 후, **파일 단위로** 그 파일의 모든 group의 caption_y 배열을 모아 `computeGroupBands(...)`로 band 계산 → 각 ReviewItem의 cropDataUrl 생성.
- caption_y가 없는 group(구버전 응답)에는 전체 이미지 썸네일을 보여줍니다 (현재처럼 빈 영역 X).

### 4) UX 안전망 — 썸네일 클릭 시 전체 스크린샷 미리보기

크롭 정확도가 100%일 수 없으므로, 썸네일을 클릭하면 dialog로 **원본 스크린샷 전체**를 띄우고 해당 caption_y 위치에 가로 강조선을 표시합니다. 이렇게 하면 사용자가 "이 번호가 진짜로 이 사진의 캡션이 맞는지" 한 번에 확인할 수 있어 실수가 차단됩니다. (shadcn `Dialog` 재사용)

### 5) 테스트

`src/test/defect-photo-ocr.test.ts`에 `computeGroupBands` 단위 테스트 4개 추가:
- 1개 group → top/bottom이 0~1 안에서 caption 주변으로 잡힘
- 3개 group → 인접 band가 겹치지 않고, midline 계산이 정확
- caption_y가 정렬되지 않은 입력 → 자동 정렬 후 계산
- 동일 caption_y 두 개의 엣지 케이스 → 0 두께 band 방지(min height 적용)

빌드(`tsc --noEmit`) + 기존 테스트 + 신규 테스트 전부 통과 확인.

## 변경 파일 요약

- `supabase/functions/defect-photo-ocr/index.ts` — schema/prompt에서 bbox 제거, caption_y_normalized 추가, "groups를 위→아래 순서로" 명시
- `src/lib/defect-photo-ocr.ts` — `OcrGroup` 타입 갱신, `computeGroupBands()` 추가
- `src/components/import/PhotoOcrPanel.tsx` — band 기반 크롭, 썸네일 클릭 시 원본 dialog
- `src/test/defect-photo-ocr.test.ts` — `computeGroupBands` 테스트 추가

DB 스키마 / 권한 / 매칭 로직은 변경 없습니다. 사진은 여전히 메모리에서만 처리되고 저장되지 않습니다.
