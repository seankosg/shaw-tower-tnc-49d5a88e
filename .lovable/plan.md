# Photo OCR 프롬프트 강화 계획

## 목적
WhatsApp 스크린샷 OCR에서:
1. 캡션 bbox(`caption_y_top`/`caption_y_bottom`)를 더 정확히 잡아 사진 그룹 크롭 오류를 줄임
2. 타임스탬프, "+N" 오버레이, 사진 내부 숫자, 인용문 숫자 등 비-캡션 숫자 인식을 제거

## 변경 범위
- 파일: `supabase/functions/defect-photo-ocr/index.ts` 의 `SYSTEM_PROMPT` 문자열만 교체
- 코드 로직, 도구 스키마, 후처리, 자릿수(1–5자리) 가정 모두 그대로 유지
- `defect-photo-ocr-crop` (Pass-2)는 변경하지 않음

## 새 SYSTEM_PROMPT 핵심 규칙 (사용자 제안 + 현행 요구사항 병합)

1. 입력은 WhatsApp 그룹 채팅 스크린샷이고, 각 그룹은 다음 구조를 가짐
   - sender 헤더 (예: "Kumar(mep)")
   - 1장 이상의 사진 (2x2 콜라주에 "+N" 오버레이 가능)
   - 사진 그리드 BOTTOM EDGE 바로 아래의 좁은 어두운 strip
   - 그 strip의 LEFT 정렬 위치에 1–5자리 standalone 숫자 캡션
   - 같은 strip의 RIGHT에는 "PM 2:42" / "오후 5:39" 같은 타임스탬프

2. 처리 순서
   - 스크린샷을 위→아래로 스캔
   - 각 photo 그룹의 마지막 사진 행의 bottom edge를 식별
   - 바로 아래 좁은 어두운 strip에서 LEFT 정렬된 standalone 숫자만 캡션으로 채택

3. 명시적 NEGATIVE 규칙 (이게 핵심 — 불필요 숫자 제거)
   - strip의 RIGHT에 있는 시간 텍스트는 절대 캡션으로 쓰지 말 것 (`AM/PM`, `오전/오후`, `:` 포함, 콜론 좌우 숫자 등)
   - 사진 위에 표시되는 "+2", "+3" 등 photo count 오버레이는 캡션 아님
   - 사진 내부(공사 현장 라벨, 도면 번호, 자/측정기 눈금)에 보이는 숫자 무시
   - 다른 사용자가 인용/포워딩한 메시지(들여쓰기·인용 박스로 표시)의 숫자는 무시
   - "Defect 2221 - Light panel" 같은 텍스트 캡션이면 선두 숫자만 추출
   - 발신자가 mep/elec/mech 현장 스태프가 아니면 `rejected_blocks`로 보냄

4. bbox 정확도 강화
   - `caption_y_top`/`caption_y_bottom`은 숫자 글리프 자체의 상하 픽셀 가장자리를 기준 (strip 전체가 아님)
   - `caption_y_normalized = (top + bottom) / 2` 등식 강제
   - top < bottom 강제, 0..1 정규화
   - 캡션은 항상 사진 BOTTOM EDGE 바로 아래에 위치하므로, top edge가 그 그룹의 어떤 사진보다도 아래에 있어야 함 (자기 검증 힌트)

5. 출력
   - top→bottom 시각 순서로 그룹 반환
   - WhatsApp 화면이 아니면 `groups=[]`, `rejected_blocks`에 `not_whatsapp`

## 검증
- Edge function 재배포 후 사용자가 기존 샘플로 한 번 OCR을 돌려 비교
- 코드 변경이 프롬프트 텍스트뿐이라 단위 테스트(`src/test/defect-photo-ocr.test.ts`) 영향 없음

## 비변경 사항
- 도구 스키마 (`extract_groups`)
- `cleanGroups` 후처리, 정렬, clamp 로직
- 클라이언트(`defect-photo-ocr.ts`, `PhotoOcrPanel.tsx`) 일체
- `verify_jwt`, CORS, 인증 흐름
