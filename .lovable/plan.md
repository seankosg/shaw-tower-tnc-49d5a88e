

# Sub-Sub 유저 타입 UI 라벨 및 필드 순서 수정

## 요약

Sub-Sub 유저 타입 선택 시, 기존 "Sub-Sub Company" 라벨을 **"Subcontractor"**로 변경하고, 해당 sub-sub의 원청 하도사(parent)가 자동으로 Subcontractor 값으로 들어가도록 UI를 수정합니다.

## 변경 내용

### `src/pages/AdminPage.tsx`

**CreateUserDialog** (약 477–496행):

현재:
- 라벨: "Sub-Sub Company" → Sub-Sub 드롭다운 → 하단에 "Parent Subcontractor: Puretech (auto-linked)" 텍스트

변경:
- 라벨: **"Subcontractor"** → Sub-Sub 드롭다운 (sub-sub 목록 표시, 각 항목에 원청 표시)
- 선택 후 하단 안내: "Parent (Subcontractor): **Puretech** — auto-assigned as subcontractor_name"

즉, Sub-Sub 유저에게 "너의 Subcontractor(원청)은 Puretech이다"라는 의미로 Subcontractor 라벨을 사용합니다.

실제 변경:
```
라벨: "Sub-Sub Company" → "Subcontractor"
placeholder: "Select Sub-Sub" → "Select sub-sub company"
하단 텍스트: "Parent Subcontractor: ..." → "Subcontractor (parent): ..."
```

**EditUserDialog** (약 627–646행): 동일하게 수정.

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/pages/AdminPage.tsx` | CreateUserDialog, EditUserDialog의 Sub-Sub 섹션 라벨 변경 |

