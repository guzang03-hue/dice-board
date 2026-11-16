# Dice Board

뱀과 사다리 같은 싱글 플레이 주사위 보드게임을 만드는 작은 엔진이에요. 주사위를 굴려 칸을 옮기고, 도착한 칸에서 무슨 일이 벌어지고, 목표 칸에 닿으면 끝나는 — 그 흐름은 코드에 들어 있습니다. 대신 맵이 어떻게 생겼는지, 자원이 무엇인지, 칸마다 어떤 사건이 기다리는지 같은 "내용물"은 전부 `public/resources/` 아래의 CSV와 이미지로 빠져 있어요.

그래서 새 게임을 만들 때 대부분은 코드를 건드릴 필요가 없습니다. 표(CSV)를 고치고 그림을 갈아 끼우면 전혀 다른 게임이 되거든요. 이 문서는 그 작업을 처음 시작하는 분을 위한 안내예요.

## 처음 실행해 보기

```bash
cd dice-board
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열면 게임이 떠요. 윈도우라면 루트의 `play.bat`을 더블클릭해도 됩니다 — 알아서 패키지를 설치하고, 개발 서버를 켜고, 브라우저까지 열어 줘요.

엔진 속을 들여다보고 싶을 땐 주소 뒤에 `?debug`를 붙여 보세요(`http://localhost:5173/?debug`). 그러면 브라우저 콘솔에서 `window.__debug`로 엔진·플레이어·보드를 직접 만질 수 있어요. 다 만들었으면 `npm run build`로 묶고 `npm run preview`로 결과물을 확인하면 됩니다.

## 폴더 둘러보기

```
dice-board/
├─ README.md                    이 문서
├─ play.bat, csv-tool.bat       더블클릭 실행 (게임 / CSV 도구)
├─ docs/                        설명서 (작성 규칙·통합 가이드·엑셀 도구·ERD·AI 스크립트)
├─ tools/                       csv-sync.mjs, schema-meta.mjs (엑셀 ↔ CSV) + 워크북
├─ public/resources/
│  ├─ data/*.csv               전역(런) 표: stats·derived·generation·assets·stages·meta
│  ├─ data/<스테이지>/*.csv     스테이지 표 (config·tiles·edges·events…) — 예: data/test/
│  ├─ images/                  그림 (CSV에서 파일명으로 참조)
│  └─ audio/                   소리
└─ src/                        엔진 코드 (데이터를 "해석"만 함)
```

게임을 만드는 동안 주로 머무는 곳은 `public/resources/`예요. `src/`는 엔진 속이라, 새 메커니즘을 더할 때만 들어가게 됩니다. 표끼리 어떻게 연결되는지 한눈에 보고 싶다면 [`docs/ERD.md`](docs/ERD.md)에 관계도가 있어요.

## 데이터는 어떻게 생겼나

모든 CSV는 사람이 읽기 좋게 **머리글 세 줄**을 둬요. 첫 줄은 한글 이름(우리 눈을 위한 것), 둘째 줄은 게임이 실제로 읽는 변수명, 셋째 줄은 타입입니다. 그 아래부터가 진짜 데이터예요.

```
이벤트 ID,이벤트 타입,...   ← 1행: 한글 이름 (사람용)
id,type,...                ← 2행: 변수명 (게임이 읽는 키)
string,string,...          ← 3행: 타입 (int/float/string/bool)
e_trap,EFFECT,...          ← 4행부터: 실제 데이터
```

세 번째 줄이 타입처럼 보이면 엔진이 알아서 이 규약으로 읽고, 아니면 머리글 한 줄짜리로도 받아 줘요. `#`으로 시작하는 줄은 주석이라 무시합니다.

## 표는 두 레이어로 나뉘어요 (전역 vs 스테이지)

표는 **수명과 소유**로 두 레이어에 나눠 둡니다.

- **전역(런) 표** — 플레이어가 스테이지를 넘어 들고 다니는 정의 + 외부 참조가 없는 어휘. `data/` 루트에 **한 벌만** 두고 모든 스테이지가 공유해요: `stats`·`derived`·`generation`·`assets`·`stages`·`meta`.
- **스테이지 표** — 이 보드의 배치와 스크립트. `data/<스테이지>/` 폴더마다 둡니다: `config`·`tiles`·`edges`·`events`·`choices`·`effects`·`conditions`·`tile_events`(필수) + `endings`·`characters`·`thresholds`·`enemies`·`items`(선택).

게임은 전역을 한 번 읽어 캐시하고 스테이지 폴더를 합쳐 한 판을 꾸려요. **불변식**: 스테이지 표는 전역을 자유롭게 가리켜도 되지만, 전역 표는 스테이지 행을 가리키면 안 됩니다(그래서 자원·상태가 스테이지를 넘어 이어질 수 있어요). 표의 "열"은 변수명(2행 기준)이고, 자세한 규칙은 [`docs/AUTHORING.md`](docs/AUTHORING.md)에 있어요.

### 전역(런) 표 — `data/` 루트에 한 벌

| 파일 | 열 | 하는 일 |
| --- | --- | --- |
| `stats.csv` | `id, label, icon, kind, min, max, start, decay, visible, display, duration, max_stacks, per_turn_target, per_turn_amount` | 플레이어가 들고 다니는 자원·상태를 한 표에. `kind`로 가름 — `number`/`bool`은 자원(min~display 사용), `status`는 지속 상태(독·실드·재생 등). status의 매 턴 효과는 `per_turn_target`/`per_turn_amount`로 표 안에서 자족합니다(effects 참조 없음) |
| `derived.csv` | `id, target, term, factor` | 다른 스탯으로 자동 계산되는 파생 스탯. `target = 기본값 + Σ(입력값 × 가중치)`로, 입력 스탯이 바뀌면 다시 계산돼요 |
| `generation.csv` | `id, region, tile_type, weight` | 빈 칸을 region별 가중치로 채우는 규칙(어휘 + 기본 가중치) |
| `assets.csv` | `id, kind, path, speaker, expr, pos` | 그림·소리 경로 (`kind`는 image/audio/**sprite**). VN 캐릭터는 `kind=sprite` 행으로 두고 `speaker/expr/pos`(left/center/right)를 채운다 — 별도 표 없음. 경로는 보통 `/resources/...` 절대경로 |
| `stages.csv` | `id, name, description, config_path, unlock_cost, icon` | 스테이지 목록. `config_path`가 그 스테이지의 데이터 폴더를 가리켜요 |
| `meta.csv` | `id, label, description, cost, effect_kind, target, value, max_rank` | 판이 끝나도 남는 영구 업그레이드 |
| `ui.csv` | `key, value` | 전역 UI 테마·시작화면 문구(색·배경·폰트·`app_name`·`app_tagline`·`lang` 등). 없으면 코드 기본값. `lang`이 ko가 아니면 부팅 때 `strings_<lang>.json`을 올려 번역 적용 |
| `strings.csv`·`strings_<lang>.json`(생성물) | `key, ko, en, …` | 번역 카탈로그. `data:strings`가 ko를 자동 추출하고, 타 언어는 사람이 채운 뒤 `data:strings:build`로 `strings_<lang>.json` 컴파일. 손으로 새로 만들지 않아요 |

### 스테이지 표 — `data/<스테이지>/` 폴더마다

| 파일 | 열 | 하는 일 |
| --- | --- | --- |
| `config.csv` | `key, value` | 스테이지 전역 설정. `start_tile`(필수)·`goal_tile`·`seed`(빈값=랜덤)·`dice`(예 `2d6`)·`board_name`·`player_name`·`portrait`·`lose_cond_group`·`on_turn_start`/`on_turn_end`(턴 훅) 등 |
| `tiles.csv` | `id, x, y, type, sprite, event_id, region, locked, label, stop` | 보드의 칸. `type`/`event_id`를 비우면 생성기가 채우고, `locked=1`이면 그대로 보존, `stop=1`이면 지나가다 멈추는 칸 |
| `edges.csv` | `id, from, to, label, cond_group` | 칸 사이 연결. `label`이 비면 주 경로, 있으면 갈림길 버튼 문구가 되고, `cond_group`은 조건부로 열리는 길 |
| `events.csv` | `id, type, cond_group, probability, payload, title, text, icon, image, background, speaker, sprite` | 칸에 도착했을 때 벌어지는 일. `type`은 EFFECT/CHOICE/MOVE/NONE, `payload`는 효과 그룹(`effects.group_id`) 참조. **VN 필드**(`background`·`speaker`·`sprite`) 중 하나라도 채우면 그 이벤트는 비주얼 노벨 화면(풀스크린 오버레이)으로 뜬다 |
| `choices.csv` | `id, event_id, choice_id, text, cond_group, result_effect_id, next_event` | CHOICE 이벤트의 선택지. `next_event`를 채우면 고른 뒤 다른 이벤트로 이어집니다(연속 선택지) |
| `effects.csv` | `id, group_id, seq, kind, target, value` | 실제 효과. 같은 `group_id`를 `seq` 순서로 모두 실행해요. `kind`는 GAIN/LOSE/SET/MOVE_TO/MOVE_DELTA/SKIP_TURN/SET_FLAG/MSG/RUN_EVENT/APPLY_STATUS/CLEAR_STATUS/DEFEAT_ENEMY/STUN_ENEMY/PUSH_ENEMY/GIVE_ITEM/TAKE_ITEM 등 |
| `conditions.csv` | `id, group_id, subject, op, value` | 조건. 다른 표의 `cond_group`이 `group_id`를 참조해요. 같은 `group_id`는 모두 만족해야 통과(AND). `id`는 행 식별용 surrogate(참조 안 함) |
| `tile_events.csv` | `id, tile_type, event_id, weight, cond_group` | 칸 타입별 도착 이벤트 풀(`event_id`가 비어 있는 칸에 적용) |
| `endings.csv` (선택) | `id, when, cond_group, priority, title, text, icon, image` | 끝날 때 자원·플래그를 보고 고르는 여러 결말. `when`은 victory/defeat/any |
| `characters.csv` (선택) | `id, name, portrait, desc, start_effect_group, icon` | 새 판을 시작할 때 고르는 캐릭터. 고른 캐릭터가 config의 초상·이름을 덮고, 시작 효과를 한 번 받습니다 |
| `thresholds.csv` (선택) | `id, subject, op, value, event, effect, mode` | 스탯이 어떤 선을 넘는 순간 이벤트나 효과를 터뜨리는 트리거. `mode`는 once/repeat |
| `enemies.csv` (선택) | `id, label, icon, start, behavior, speed, damage, event, vision, contact, sprite, cond_group` | 적. `behavior`는 chase/wander/ambush/turret/ranged, 같은 칸에서 만나면(`contact`) `event`가 열리고, 선택지 효과로 적을 처치·기절·밀어낼 수 있어요 |
| `items.csv` (선택) | `id, name, icon, desc, use_effect_group, consumable, max_stack, cond_group` | 들고 다니며 쓰는 아이템. `GIVE_ITEM`/`TAKE_ITEM`으로 증감, 조건에선 `item.<id>`로 보유 수를 봅니다 |

> 참고: `edges`·`generation`·`tile_events`·`derived`·`choices`의 맨 앞 `id`는 행을 가리키는 형식상 surrogate예요(참조엔 자연키 `from/to` 등을 씀). 의미를 담지 말고 숫자 범위 인덱스(`100001~`)로 적길 권합니다.

## 조건 적는 법

"골드가 5 이상이면" 같은 조건은 이벤트나 선택지에 직접 쓰지 않고, `conditions.csv`에 적어 두고 `cond_group`으로 `group_id`를 가리켜요. 한 줄이 술어 하나(`{subject, op, value}`)이고, 같은 `group_id`에 묶인 술어는 **모두 만족해야** 통과합니다(AND).

비교는 엑셀이 수식으로 착각하지 않도록 기호 대신 키워드를 써요.

| 이상 | 이하 | 초과 | 미만 | 같음 | 다름 |
|---|---|---|---|---|---|
| `min` | `max` | `over` | `under` | `is` | `not` |

`subject`에는 자원 id(`hp`·`gold`…)나 `flag.<이름>`, `status.<id>`(남은 턴)를 적고, `value`에는 숫자나 `true`/`false`를 적어요. 읽으면 그대로 문장이 됩니다 — `gold min 2`, `hp max 5`, `flag.boss_killed is true`. 예를 들어 "골드 5 이상 **그리고** HP 3 이상"은 같은 그룹에 두 줄로 적어요.

```
id,        group_id, subject, op,  value
c_rich_1,  cg_rich,  gold,    min, 5
c_rich_2,  cg_rich,  hp,      min, 3
```

OR나 괄호는 없어요(그룹은 언제나 AND). "이거 아니면 저거"가 필요하면, 앞선 효과에서 `flag`를 세워 두고 `flag.x is true`로 갈라 주면 됩니다.

## 엑셀로 편하게 작업하기

CSV를 엑셀로 바로 열면 한글이 깨질 수 있어서 모든 파일은 UTF-8 BOM으로 저장해요. 여러 표를 한 번에 다루고 싶을 땐 `tools/csv-sync.mjs`가 CSV를 엑셀 워크북으로 바꿔 줍니다. 단순히 시트만 만들어 주는 게 아니라, 참조 칸엔 **드롭다운**이 달리고, 잘못 가리킨 값은 **빨갛게** 표시되고, id 옆엔 그게 가리키는 이름이 같이 떠요. 작업이 한결 수월해집니다.

```bash
npm run data:import           # CSV → 마스터 + 도메인 워크북 4개 (드롭다운·색·헬퍼)
npm run data:export           # 마스터 워크북 → CSV
npm run data:export -- map    # 특정 도메인만 내보내기 (map|narrative|entity|setup)
npm run data:validate         # 데이터가 멀쩡한지 검사 (헤더/필수칸/숫자·enum + 참조 · 불변식 · 맵 구조)
npm run data:bom              # 모든 CSV에 BOM 입히기

node tools/csv-sync.mjs stage:list      # 스테이지 목록(stages.csv + 폴더)
node tools/csv-sync.mjs stage:new <id>  # 새 스테이지 폴더 골격 + stages.csv 등록 (워크북 자동 재생성)
node tools/csv-sync.mjs stage:rm  <id>  # 스테이지 폴더 삭제 + stages.csv에서 제거 (워크북 자동 재생성)
node tools/csv-sync.mjs table:add <스테이지> <표>  # 선택 표(endings/characters/enemies/items/thresholds) 켜기
node tools/csv-sync.mjs table:rm  <스테이지> <표>  # 선택 표 끄기 (필수 표는 거부)

npm run data:strings          # 데이터 텍스트 + 코드 tu() → strings.csv(key, ko) 추출(기존 번역 보존)
npm run data:strings:build    # strings.csv의 언어 컬럼 → strings_<lang>.json (ko는 인라인이라 제외)
```

### 다국어(번역) 붙이는 법
1. `npm run data:strings` — 모든 사용자 텍스트를 훑어 `strings.csv`에 `key, ko`를 채워요(키는 엔진 조회 형식 그대로). 콘텐츠를 고친 뒤 다시 돌리면 새 키는 추가, 사라진 키는 리포트하고, 이미 적은 번역은 보존돼요.
2. `strings.csv`에 `en`(또는 `ja`…) 컬럼을 더해 사람이 번역을 채워요. ko는 그대로 두면 됩니다(인라인 기본).
3. `npm run data:strings:build` — 언어 컬럼별로 `strings_<lang>.json`을 만들어요.
4. `ui.csv`의 `lang`을 `en`으로 두면 부팅 때 그 언어팩이 인라인 위에 덮여요. 번역 안 된 키는 자동으로 한국어로 보입니다(섞여도 안전).

게임이 실제로 읽는 건 언제나 CSV예요. 엑셀은 편집을 돕는 사본일 뿐이라, 거기서 더한 드롭다운이나 메모 열은 내보낼 때 알아서 빠집니다. 그리고 데이터가 맞는지 최종으로 판정하는 건 `data:validate`고요 — 깨진 참조, 시작 칸에서 닿을 수 없는 칸, 막다른 칸, 출구가 전부 조건부라 갇힐 수 있는 갈림길을 한 번에 짚어 줘요. 더 자세한 사용법은 [`docs/TOOLING.md`](docs/TOOLING.md)에 있고, 윈도우라면 `csv-tool.bat` 메뉴로도 같은 일을 할 수 있어요.

## 새 컨셉으로 갈아끼우기

대부분은 데이터만 손대면 돼요. 새 스테이지는 `node tools/csv-sync.mjs stage:new <id>`로 골격 폴더를 만들고(`config`·`tiles`·`edges` + 필수 표 + `stages.csv` 등록까지 한 번에), 그 폴더의 CSV를 채우면 됩니다. 자원·상태(`stats`)나 파생·생성·자산은 전역이라 `data/` 루트의 것을 그대로 공유해요. 그림은 `images/`에 두고 전역 `assets.csv`나 `tiles.sprite`, `events.image`에서 파일명으로 부르면 되고, `config.csv`의 시작·목표 칸과 시드를 맞춘 뒤 새로고침하면 끝이에요.

코드까지 가야 하는 경우는 드물지만, 새 종류의 효과가 필요하면 `src/effects/effects.ts`에 `registerEffect("MY_KIND", (eff, ctx) => { ... })`를 한 줄 더하고 `effects.csv`에서 `kind=MY_KIND`로 쓰면 됩니다. 효과 연결이나 조건으로도 안 되는 완전히 새 이벤트 방식이 필요할 때만 `EventEngine`의 `handle()`에 손을 대고요. 데이터를 엑셀이나 구글 시트에서 바로 읽고 싶다면 `src/data/DataSource.ts`를 구현해 `main.ts`에서 `CsvSource`만 바꿔 끼우면 됩니다.

## 보드는 어떻게 만들어지나

칸은 대부분 **그때그때 랜덤으로** 채워져요. `tiles.type`을 비워 두면 그 칸의 `region`에 맞는 `generation` 가중치로 타입을 뽑고, 도착했을 때의 이벤트는 `tile_events` 풀에서 뽑습니다. 반대로 `type`이나 `event_id`를 직접 채우거나 `locked=1`로 두면 그 칸은 고정돼요. 고정과 랜덤을 섞는 방법은 [`docs/AUTHORING.md`](docs/AUTHORING.md)에 더 적어 뒀어요.

`config.seed`는 기본적으로 비어 있어서, 켤 때마다 새 보드가 나옵니다. 다만 한 판을 시작하면 그 판 전용 시드를 즉석에서 만들어 저장하기 때문에, 세이브를 이어서 하면 같은 보드가 그대로 돌아와요. `seed`에 값을 적어 두면(`demo-42` 같은 문자열도 괜찮아요) 언제나 똑같은 게임이 됩니다.

## 한 턴이 흘러가는 순서

판이 시작되면 CSV를 읽어 들이고, 그 판의 시드로 난수를 준비한 뒤, 빈 칸을 채워 보드를 그리고 토큰을 시작 칸에 올려 둬요. 그다음부터는 이런 흐름이 반복됩니다 — 주사위를 굴리고, 한 칸씩 움직이며 갈림길이나 조건부 길을 고르고(멈춤 칸이면 거기서 정지), 도착한 칸의 이벤트를 풀어내고(고정 이벤트가 우선, 없으면 타입 풀에서 추첨), 효과를 적용하고 HUD를 갱신해요. 그러다 패배 조건에 걸리거나 목표 칸에 닿으면 결말로 마무리됩니다.

## 더 읽을거리

- [`docs/GUIDE.md`](docs/GUIDE.md) — 표와 엔진 전체를 처음부터 풀어 설명하는 통합 입문서
- [`docs/AUTHORING.md`](docs/AUTHORING.md) — 데이터를 직접 쓸 때의 규칙(작업 전 한 번 읽어 두면 좋아요)
- [`docs/TOOLING.md`](docs/TOOLING.md) — 엑셀 워크북으로 작업하는 법
- [`docs/ERD.md`](docs/ERD.md) — 표끼리의 참조 관계도
- [`docs/AI-BEHAVIORS.md`](docs/AI-BEHAVIORS.md) — 적 AI 행동 스크립트를 만들고 고치는 법
