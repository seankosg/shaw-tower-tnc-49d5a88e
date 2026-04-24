

## Item Detail 풀다운 메뉴 적용 + Team 표시

### 변경 대상 (`src/pages/DefectDetailPage.tsx`)

자유 텍스트 Input 6개를 DB/Enum 기반 드롭다운으로 교체하고, "Type" 자리에 "Team" 노출.

### 데이터 소스

| 필드 | 소스 | 옵션 |
|---|---|---|
| Subcontractor | `subcontractor_master` (is_active=true, type='sub') | name 정렬 |
| Sub-Sub | `subcontractor_master` (is_active=true, type='subsub') | name 정렬, 가능하면 선택된 Subcontractor의 자식만 필터 |
| HDEC PIC | `hdec_pic_master` (is_active=true) | name 정렬 |
| Completion Status | `DEFECT_STATUS_VALUES` (`Planned/WIP/Delay/Done`) | 고정 enum |
| Closure Status | `DEFECT_STATUS_VALUES` | 고정 enum |
| Team | `ALL_TEAMS` (`Mech/Elec/Arch/Supp`) + `formatTeamLabel` 라벨 | 고정 enum |

### 구현 내용

**1. 마스터 데이터 로드 (useEffect 한 번)**

```text
const [subOptions, setSubOptions]       = useState<{ name }[]>([]);
const [subsubOptions, setSubsubOptions] = useState<{ name, parent_subcontractor_id }[]>([]);
const [hdecOptions, setHdecOptions]     = useState<{ name }[]>([]);

// 동시 fetch:
//   subcontractor_master where is_active=true (모두) → type 으로 분리
//   hdec_pic_master where is_active=true
```

**2. 새 컴포넌트 `SelectField` (Field 옆에 추가)**

```text
<SelectField
  label="Subcontractor"
  value={form.subcontractor_name ?? ''}
  options={subOptions.map(o => ({ value: o.name, label: o.name }))}
  disabled={!canEditResponsibility}
  onChange={(v) => updateField('subcontractor_name', v || null)}
  allowClear   // "—" (Clear) 옵션 포함
/>
```

내부적으로 shadcn `Select` (`@/components/ui/select`) 사용, `<SelectItem value="__none__">— None —</SelectItem>` 로 clear 처리. `disabled` 시 `Input` 과 동일한 readonly 룩.

**3. Sub-Sub 옵션 동적 필터**

선택된 Subcontractor 의 master row id 를 찾아 `parent_subcontractor_id` 일치하는 subsub 만 노출. 매칭 안 되면 전체 subsub 노출 (옛 데이터 호환).

```text
const selectedSubId = subOptions.find(o => o.name === form.subcontractor_name)?.id ?? null;
const subsubFiltered = selectedSubId
  ? subsubOptions.filter(o => o.parent_subcontractor_id === selectedSubId)
  : subsubOptions;
```

**4. Status 두 필드를 enum 드롭다운으로**

```text
<SelectField label="Completion Status" value={form.completion_status ?? ''}
  options={DEFECT_STATUS_VALUES.map(s => ({ value: s, label: s }))} ... />
<SelectField label="Closure Status" value={form.closure_status ?? ''}
  options={DEFECT_STATUS_VALUES.map(s => ({ value: s, label: s }))} ... />
```

**5. "Type" → "Team" 교체**

현재 line 350:
```text
<Field label="Type" value={form.area_type} ... />   ← 제거
```
대체:
```text
<SelectField
  label="Team"
  value={form.team ?? ''}
  options={ALL_TEAMS.map(t => ({ value: t, label: TEAM_LABELS[t] }))}
  disabled={!canEditResponsibility}
  onChange={(v) => updateField('team', v || null)}
/>
```
- 표시 라벨은 풀네임 (Mechanical 등), 저장값은 enum (Mech).
- `area_type` 입력 자체는 여전히 Raw Payload 카드에 보존(원본 그대로). 헤더 영역에서만 Type 자리를 Team 으로 대체.
- `team` 을 `editableFields` 에 추가하고 권한은 `canEditResponsibility` 와 동일 처리 (팀 변경은 책임자 변경의 일종).
- area_type 편집을 완전히 잃고 싶지 않다면, 카드 하단 보조 영역에 readonly 로 1줄 노출 가능 — 이번 변경에는 포함하지 않음 (요청대로 "그 자리에 Team 표시").

**6. payload 에 `team` 추가**
```text
payload.team = form.team ?? null;   // canEditResponsibility 일 때만 포함
```
그리고 `editableFields` 배열에도 `'team'` 추가하여 변경 감지/change_log 기록.

**7. 라벨 일관성**
- Field Config 가 해당 필드명을 갖고 있으면 `getLabel()` 사용; 없으면 하드코딩 라벨 유지.

### 변경하지 않는 항목

- DB 스키마, RLS, Edge Function, master 자동 생성 로직
- Raw Data / Progress / Export / Dashboard 페이지
- `Field`, `ReadonlyField` 함수
- `area_type` DB 컬럼 자체 (그대로 저장됨, UI 노출만 제외)

### 검증

```text
1. /defects/:id 진입 → Subcontractor 드롭다운 클릭 → DB 의 sub 마스터 목록 노출
2. Subcontractor 변경 → Sub-Sub 옵션이 해당 부모의 subsub 로 좁혀짐
3. HDEC PIC 드롭다운에 hdec_pic_master 전체 노출
4. Completion / Closure Status 드롭다운에 Planned/WIP/Delay/Done 4개
5. Type 자리에 "Team" 라벨 + 풀네임(Mechanical/Electrical/...) 옵션
6. Team 변경 후 Save → defect_items.team 갱신, defect_change_log 에 'team' 행 기록
7. canEditResponsibility=false 사용자: 6개 모두 disabled (보기만)
8. 빈 값 선택 (— None —) → null 저장 가능
9. 기존 값이 master 에 없는 경우(legacy) → 현재 값을 옵션 맨 위에 임시 추가하여 노출 (값 보존)
```

