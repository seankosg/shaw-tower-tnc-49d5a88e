# 수정 코드 검토 결과

업로드된 `photo-ocr-merged.zip`의 6개 파일을 현재 프로젝트와 비교한 결과입니다.

## 비교 요약

| 파일 | 상태 |
|---|---|
| `PhotoOcrPanel.tsx` | 동일 (변경 없음) |
| `defect-photo-ocr.test.ts` | 동일 |
| `edge/defect-photo-ocr.ts` | 동일 |
| `edge/defect-photo-ocr-crop.ts` | 동일 |
| **`defect-photo-ocr.ts` (lib)** | **변경 — `canvasSegmentBands()` 신규 추가** |
| **`PhotoOcrContext.tsx`** | **변경 — crop 로직을 canvas 우선 → AI bbox fallback 으로 교체** |

실제 적용해야 할 파일은 **2개**뿐입니다.

## 변경 내용 요약

1. **`src/lib/defect-photo-ocr.ts`**
   - `canvasSegmentBands(dataUrl)` 추가
   - 캔버스에 이미지를 그려 행별 휘도(luminance)를 측정
   - 어두운 배경(메시지 사이 간격) ↔ 밝은 영역(사진 그룹)을 픽셀 단위로 자름
   - 각 밝은 클러스터 아래 `CAPTION_PAD = 42px`를 추가해 caption strip을 포함
   - 결과: `GroupBand[]` (0..1 정규화)

2. **`src/contexts/PhotoOcrContext.tsx`**
   - 기존: 무조건 `computeGroupBands()` (AI bbox 기반)
   - 변경: `canvasSegmentBands()` 먼저 시도 → 개수 일치하면 사용, 더 많으면 caption_y로 매칭, 적거나 실패하면 기존 AI bbox로 fallback
   - `console.debug`로 어떤 경로(canvas / canvas-matched / ai-bbox)가 쓰였는지 출력

## 안전성 검토

- **타입/Export**: `GroupBand`는 이미 `defect-photo-ocr.ts`에서 export 중 → import 가능
- **순수 추가**: 기존 함수 시그니처/동작 변경 없음 → 다른 호출자에 영향 없음
- **테스트 호환성**: `canvasSegmentBands`는 브라우저 API(`Image`, `document.createElement('canvas')`)를 사용하지만 함수 본문은 호출 시에만 실행. 기존 테스트는 호출하지 않으므로 jsdom에서 import만 해도 안전
- **Edge Function 영향 없음**: 두 edge function은 변경 사항 없으므로 재배포 불필요
- **Fallback 안전망**: try/catch로 감싸져 있어 canvas가 실패해도 기존 AI bbox 경로로 자동 복구
- **CORS**: data URL이라 `getImageData()` 캔버스 오염 문제 없음

## 잠재적 주의점 (블로커는 아님)

- 큰 스크린샷(예: 1080×4000)에서 픽셀 루프가 메인 스레드를 잠시 점유할 수 있습니다 (~수백 ms). 모바일에서 체감되면 추후 webworker로 옮기는 안을 고려할 수 있습니다.
- `DARK = 45`, `MIN_DARK_SEP = 8`, `CAPTION_PAD = 42` 값은 WhatsApp/Telegram 다크 테마 기준입니다. 라이트 테마 스크린샷에서는 canvas 경로가 매칭에 실패하고 AI bbox fallback으로 떨어집니다 (정상 동작).

## 적용 계획

1. `src/lib/defect-photo-ocr.ts` 에 `canvasSegmentBands` 함수 추가 (line 165 부근, `computeGroupBands` 바로 아래)
2. `src/contexts/PhotoOcrContext.tsx`
   - import 구문에 `canvasSegmentBands`, `type GroupBand` 추가
   - crop 루프 시작 부분의 `const bands = computeGroupBands(...)` 한 줄을 신규 try/canvas/fallback 블록으로 교체
3. 빌드/타입체크는 자동 수행됨. 별도 마이그레이션·시크릿·재배포 불필요.

→ **결론: 적용에 문제 없습니다.** Implement 버튼을 눌러 진행하시면 위 2개 파일만 수정합니다.
