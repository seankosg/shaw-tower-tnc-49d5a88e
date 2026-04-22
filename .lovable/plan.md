
## 변경 목표

Progress 탭 상단 Toolbar에서 현재 `Bucket` 옆에 있는 `Show Past / Hide Past` 버튼을 제거하고, 아래쪽 `Show Risk Panel / Hide Risk Panel` 버튼의 좌측으로 이동합니다.

## 현재 구조

현재 버튼 위치는 다음과 같습니다.

```text
Toolbar:
Group | Team | Bucket [Day/Week] [Show/Hide Past] | Stage | As-of | Range | Lookup

Matrix 상단 우측:
[Show/Hide Risk Panel]
```

## 변경 후 구조

변경 후 버튼 위치는 다음과 같습니다.

```text
Toolbar:
Group | Team | Bucket [Day/Week] | Stage | As-of | Range | Lookup

Matrix 상단 우측:
[Show/Hide Past] [Show/Hide Risk Panel]
```

## 구현 내용

수정 대상 파일:

```text
src/pages/SchedulePage.tsx
```

### 1. Bucket 그룹에서 Show Past 버튼 제거

`ToolbarGroup label="Bucket"` 내부에는 `Day / Week` 선택만 남깁니다.

```text
Bucket: Day / Week
```

### 2. Matrix + Watchlist 상단 버튼 영역에 Show Past 버튼 추가

현재 `Show Risk Panel` 버튼이 있는 영역을 다음처럼 변경합니다.

```text
<div className="flex items-center justify-end gap-2">
  [Show/Hide Past 버튼]
  [Show/Hide Risk Panel 버튼]
</div>
```

### 3. 기존 동작 유지

버튼 위치만 변경하고 기존 기능은 그대로 유지합니다.

```text
hidePast 상태 유지
localStorage 저장 유지
URL query hide_past 유지
버튼 아이콘 유지
Show past / Hide past 텍스트 유지
```

## 최종 동작

Progress 탭에서 사용자는 Bucket 옆이 아닌 Risk Panel 버튼 바로 왼쪽에서 Past 표시 여부를 제어하게 됩니다.

```text
Show Past / Hide Past 버튼 클릭
→ 과거 날짜 표시/숨김 전환

Show Risk Panel / Hide Risk Panel 버튼 클릭
→ Risk Panel 표시/숨김 전환
```

데이터베이스 변경은 필요 없습니다.
