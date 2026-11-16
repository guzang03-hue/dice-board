# 엑셀로 데이터 작업하기

게임이 실제로 읽는 건 언제나 CSV예요. 엑셀 워크북은 그 CSV에서 만들어 내는 **작업용 사본**이고요. `tools/csv-sync.mjs`가 이 둘 사이를 오가게 해 줍니다 — CSV를 보기 좋은 워크북으로 펼쳐 주고, 편집이 끝나면 다시 CSV로 거둬들이는 식이에요.

단순히 시트만 만들어 주는 게 아니라, 작업이 편하도록 이런 것들이 자동으로 붙어요. 참조하는 칸(`event_id` 같은)에는 고를 수 있는 **드롭다운**이 달리고, 없는 값을 가리키면 **빨갛게** 표시되고, id 옆에는 그게 가리키는 이름이 같이 떠요(예: `e_trap` 옆에 `→ 함정!`). enum(`op`·`behavior`처럼 정해진 값)도 드롭다운으로 나오고요.

## 명령어

```bash
npm run data:import           # CSV → 마스터 1개 + 도메인 워크북 4개
npm run data:export           # 마스터 워크북 → CSV
npm run data:export -- map    # 도메인 하나만 내보내기 (map|narrative|entity|setup)
npm run data:validate         # 데이터가 멀쩡한지 검사 (헤더·필수칸·숫자/enum·참조·맵 구조)
npm run data:bom              # 모든 CSV에 UTF-8 BOM
npm run data:migrate          # 옛 한 줄 머리글 → 세 줄 머리글로 변환
npm run data:strings          # 데이터 텍스트 + 코드 tu() → strings.csv(key, ko) 추출
npm run data:strings:build    # strings.csv 언어 컬럼 → strings_<lang>.json

node tools/csv-sync.mjs stage:list      # 스테이지 목록(stages.csv + 폴더 유무)
node tools/csv-sync.mjs stage:new <id>  # 새 스테이지 골격 + stages.csv 등록 (워크북 자동 재생성)
node tools/csv-sync.mjs stage:rm  <id>  # 스테이지 폴더 삭제 + 등록 해제 (워크북 자동 재생성)

node tools/csv-sync.mjs table:add <스테이지> <표>  # 선택 표 생성 — 3행 헤더만 (워크북 자동 재생성)
node tools/csv-sync.mjs table:rm  <스테이지> <표>  # 선택 표 삭제 — 필수 표는 거부 (워크북 자동 재생성)
```

선택 표는 `endings`(멀티 엔딩) · `characters`(시작 캐릭터) · `enemies`(적) · `items`(아이템) · `thresholds`(임계 트리거) 다섯이에요. `stage:new`는 필수 표 8종만 깔기 때문에, 이 기능들이 필요해지면 `table:add`로 그때그때 켜면 됩니다(빈 표 = 기능 꺼짐과 동일이라 게임에 무해). 워크북 시트와 드롭다운도 같이 생기고 사라져요. `csv-tool.bat`에서는 [7] 메뉴가 같은 일을 합니다.

`strings`는 모든 사용자 텍스트(데이터 표의 텍스트 칼럼 + 코드 `tu()` 기본값 + `ui.csv`의 app_name 등)를 훑어 `strings.csv`에 `key, ko`를 채운다. 키는 엔진의 `td()/tu()` 조회와 같은 형식(`<표>_<id>_<칼럼>` · `UI_<id>`)이라 그대로 번역에 쓰인다. 재실행 시 새 키는 추가, 사라진 키는 리포트, 이미 적은 타 언어 번역은 보존한다. `en` 등 언어 컬럼을 사람이 채운 뒤 `strings:build`로 `strings_<lang>.json`을 만들고, `ui.csv`의 `lang`을 그 코드로 두면 부팅 때 인라인 위에 덮인다(미번역 키는 한국어 폴백).

윈도우라면 루트의 `csv-tool.bat`을 더블클릭해 메뉴로도 같은 일을 할 수 있어요.

## 워크북은 다섯 개로 나뉘어요

`data:import`을 돌리면 워크북이 다섯 개 생겨요. 전부 담은 **마스터** 하나와, 작업 영역별로 나눈 **도메인** 넷이에요.

| 파일 | 담는 것 | 언제 쓰나 |
|---|---|---|
| `dice-board-tables.xlsx` | 전체 (모든 스테이지의 모든 표) | 여러 영역을 오가며 작업할 때. 모든 참조 드롭다운이 작동해요 |
| `domain-map.xlsx` | tiles · edges · generation · tile_events | 맵을 짤 때 |
| `domain-narrative.xlsx` | events · choices · effects · conditions · endings | 시나리오를 쓸 때 |
| `domain-entity.xlsx` | stats · characters · enemies · derived · thresholds · items | 자원·적·밸런스를 만질 때 |
| `domain-setup.xlsx` | config · stages · meta · assets · ui | 전역 설정과 그림·소리·테마 |

각 워크북에는 한눈에 보는 `_Index` 시트와, 모든 표의 설명을 한곳에 모은 `_안내` 시트가 함께 들어가요. `_안내`는 도메인별로 묶여 있고, 표마다 무슨 일을 하는지와 각 칸에 무엇을 적는지를 서술형으로 적어 둔 설명서예요. 시트 이름은 폴더를 점으로 적어요 — `events`는 루트의 `events.csv`, `hero.events`는 `hero/events.csv`로 갑니다. 도메인 구성과 탭 색, 표 설명은 `tools/schema-meta.mjs`에서 정해요.

## 평소 작업 흐름

```
1. 도메인 워크북을 열어 편집      예: domain-narrative.xlsx
2. npm run data:export -- narrative   그 도메인을 CSV로 내보내고
3. npm run data:validate              전체를 한 번 검사한 뒤
4. npm run data:import                워크북을 새로 그려요 (빨강·드롭다운 최신화)
```

집중해서 작업할 땐 도메인 워크북이 편하고, 여러 영역을 가로지르는 참조 — 이를테면 맵의 `tiles.event_id`가 시나리오의 events를 가리키는 경우 — 는 **마스터에서** 거는 게 좋아요. 도메인 워크북에는 events 시트가 없어서 드롭다운이 안 뜨거든요. 그래도 손으로 적어도 괜찮아요. `data:validate`가 뒤에서 받쳐 주니까요.

## 알아 두면 좋은 것들

- **한 번에 한 워크북만 편집해요.** 마스터와 도메인을 동시에 따로 고치면, 나중에 내보내는 쪽이 이깁니다. 편집 → export → 재생성 순서를 지켜 주세요.
- **스테이지를 만들거나 지우면(`stage:new`/`stage:rm`) 워크북이 자동으로 새로 그려져요.** 따로 import를 돌릴 필요 없이 시트가 바로 늘고 줄어요. (워크북이 엑셀에 열려 있으면 그 파일만 건너뛰니, 닫고 import를 다시 돌리세요.)
- **export는 `stages.csv`에 등록된 스테이지의 시트만 내보내요.** 옛 워크북에 삭제된 스테이지 시트가 남아 있어도, export 한 번에 그 폴더가 CSV로 되살아나는 일은 없어요. 건너뛴 시트는 경고로 알려 주니, 그게 보이면 워크북이 낡았다는 뜻 — `data:import`로 새로 그리세요.
- **`data:import`은 워크북을 새로 그려요.** 그래서 드롭다운과 빨강 표시가 늘 최신이고, 드롭다운 목록도 지금 있는 id에 맞춰져요. 평소엔 편집 → export만 반복하니 손댄 내용은 그대로 남고, 재생성은 CSV가 바깥에서 바뀌었을 때만 돌리면 됩니다. (직접 꾸민 서식은 재생성하면 새로 그려질 수 있어요.)
- **엑셀이 파일을 열고 있으면 잠겨서** 그 파일은 건너뛰어요. 닫고 다시 돌리면 됩니다.
- **스키마가 바뀐 뒤엔 꼭 `data:import`으로 마스터를 새로 그린 다음** 내보내세요. 옛 마스터를 그대로 export하면 옛 데이터로 CSV를 덮어쓸 수 있어요.

## 한 가지 약속

게임은 CSV만 읽어요. 엑셀의 드롭다운·색·id 옆 이름 같은 건 작업을 돕는 장치일 뿐, 게임으로는 넘어가지 않아요(내보낼 때 스키마에 정의된 컬럼만 통과하거든요). 그래서 데이터가 맞는지 최종으로 판정하는 곳은 언제나 `data:validate`입니다.
