## 목적
업로드한 `DMR.xlsx` (시트 `DB_통합`, 909행, 2026-05-02 ~ 2026-05-23, 16일치)를 `dmr_entries` 테이블에 일회성 마이그레이션합니다.

## Subcontractor 정규화 매핑 (Excel → `subcontractor_master` canonical name)
| Excel | 매핑 |
|---|---|
| ACU, ASK, Finebuild, GRB, HDEC, Kok Keong, Kurihara, RICO, SYS | 동일 |
| Kurihara (ACMV) | Kurihara |
| Eocplus | ECOPLUS |
| MERO | Mero |
| Maxbond | MAXBOND |
| Microtac | MICROTAC |
| Octopus | OCTOPUS |
| PureTech | Puretech |
| Schindler Lift | SCHINDLER |
| Suntech | SUNTECH |
| Tatseng | Tat Seng |
| NEE LEE | **신규 추가 (sub, active)** |

Team(Arch/Mech/Elec)·Workplace(T&C/Defect/Post TOP)는 enum/check와 일치하여 변환 없음. Trade NULL 값은 그대로 NULL 유지.

## 실행 단계
1. **Migration**: `subcontractor_master`에 `NEE LEE` (type=`sub`, is_active=true) 추가.
2. **Data insert**: 정규화 적용한 909행을 `dmr_entries`에 일괄 INSERT (source_image_path NULL, created_by NULL).
3. 날짜별 행수 SELECT로 검증.

코드 변경 없음 (DB 작업만).
