# 데이터 작성 규칙

이 게임의 콘텐츠 — 맵이며 자원이며 이벤트, 조건, 효과, 캐릭터까지 — 는 전부 CSV 표로 만들어요. 엔진은 그 표를 "해석"만 하기 때문에, 새 내용을 더할 때는 대개 코드를 건드리지 않고 표에 줄을 더하거나 고치면 됩니다. 코드까지 가야 하는 건 아예 새로운 *방식*이 필요할 때뿐이에요(그 얘기는 README의 "새 컨셉으로 갈아끼우기"에 있어요).

한 가지만 습관으로 들여 두면 좋아요. 작업을 마치면 꼭 `npm run data:validate`로 한 번 검사하는 거예요. 참조 오타나 갇히는 칸 같은 걸 미리 잡아 줍니다.

## 머리글은 세 줄이에요

모든 CSV는 머리글이 세 줄이에요. 첫 줄은 우리가 알아보기 위한 한글 이름, 둘째 줄은 게임이 실제로 읽는 변수명, 셋째 줄은 타입이고, 그 아래부터가 데이터입니다.

```
이벤트 ID,이벤트 타입,...   ← 1행: 한글 이름 (사람용, 게임은 안 읽어요)
id,type,...                ← 2행: 변수명 (게임이 읽는 진짜 키)
string,string,...          ← 3행: 타입 (int/float/string/bool)
e_trap,EFFECT,...          ← 4행부터: 실제 데이터
```

첫 줄에는 `← tiles.id`처럼 "이 칸은 저길 가리켜요" 같은 힌트를 적어 둬도 좋아요. 파서가 첫 줄은 무시하니까 마음껏 메모해도 됩니다. 열 순서도 자유예요 — 게임은 둘째 줄의 변수명으로 맞춰 읽으니까요. 다만 비슷한 의미의 열은 나란히 두면 보기 편하겠죠.

## 한 칸에는 한 값만 (1NF)

이건 꼭 지켜 주세요. **셀 하나에는 값 하나만** 넣어요. `a|b`나 `id1;id2`처럼 한 칸에 여러 값을 욱여넣는 건 금지예요. 값이 여럿 필요하면 한 칸에 몰아넣는 대신 **`group_id`로 묶어 줄을 더하면** 됩니다(바로 아래 "묶어서 적기"). 참고로 `gold≥2` 같은 조건식 하나는 한 덩어리로 보니까 괜찮아요.

## 무엇이 무엇을 가리키나 (참조 지도)

표끼리의 연결은 전부 문자열 id를 맞추는 방식이에요. 어떤 열이 어디를 가리키는지 정리하면 이래요.

| 이 열이 | 여기를 가리켜요 |
|---|---|
| `edges.from` / `edges.to` | `tiles.id` |
| `tiles.event_id` | `events.id` (고정 이벤트) |
| `tiles.sprite` | `assets.id` |
| `tiles.region` | `generation.region` (전역) |
| `events.payload` | `effects.group_id` (또는 `move:N`) |
| `choices.result_effect_id` | `effects.group_id` |
| `choices.next_event` | `events.id` (이어지는 선택지) |
| `tile_events.event_id` | `events.id` |
| `*.cond_group` (events·choices·tile_events·endings·edges·enemies·items·`config.lose_cond_group`) | `conditions.group_id` |
| `effects.target` | kind마다 달라요: `stats.id`(자원) / 플래그 이름 / 타일 id / `stats.id`(kind=status, 부여·해제) / `events.id`(RUN_EVENT) / `items.id`(GIVE/TAKE) / 지금 만난 적(*_ENEMY) |
| `meta.target` | `stats.id` (전역) |
| `characters.start_effect_group` | `effects.group_id` |
| `stats.per_turn_target` (kind=status) | `stats.id` (전역, 매 턴 증감 대상) |
| `derived.target` / `derived.term` | `stats.id` (전역) |
| `thresholds.subject` | `stats.id` / `flag.<>` / `status.<>` |
| `thresholds.event` / `thresholds.effect` | `events.id` / `effects.group_id` |
| `enemies.start` / `enemies.event` / `enemies.sprite` | `tiles.id` / `events.id` / `assets.id`(전역) |
| `items.use_effect_group` | `effects.group_id` |
| `config.on_turn_start` / `config.on_turn_end` | `effects.group_id` |
| `stages.config_path` | 스테이지 CSV 폴더 |

> **레이어**: `stats`·`derived`·`generation`·`assets`·`stages`·`meta`는 전역(런) 표라 `data/` 루트에 한 벌, 나머지는 스테이지 폴더에 둡니다. 스테이지는 전역을 가리켜도 되지만 그 반대는 금지예요(검증이 강제). `edges`·`generation`·`tile_events`·`derived`·`choices`의 맨 앞 `id`와 `conditions`/`effects`의 `id`는 행 식별용 surrogate라 참조엔 안 쓰여요(참조는 `group_id`·자연키).

엑셀 워크북으로 작업하면 이 참조들이 드롭다운으로 떠서 직접 외울 필요는 없어요. 그래도 큰 그림을 알아 두면 데이터가 한결 잘 읽힙니다.

## 묶어서 적기 (효과 · 조건 공통)

여러 단계를 거치는 효과나 여러 조건을 한꺼번에 보는 경우엔, 같은 패턴 하나로 풀어요 — **`id`는 줄마다 고유하게(행 식별용), `group_id`로 같은 묶음을 만드는** 거예요. 참조는 언제나 `group_id`를 가리키고, `id`는 참조에 쓰지 않아요.

효과는 같은 `group_id`를 `seq` 순서대로 전부 실행해요. 그러니까 "HP를 깎고, 이어서 골드도 깎는다"는 이렇게 두 줄로 적어요.

```
id,            group_id, seq, kind, target, value
ef_beast_1,    ef_beast, 1,   LOSE, hp,     1
ef_beast_2,    ef_beast, 2,   LOSE, gold,   1
```

이벤트의 `payload`나 선택지의 `result_effect_id`는 이 `group_id`를 가리킵니다. 조건도 똑같아요. 같은 `group_id`의 줄은 **모두 참이어야** 통과예요(그러니까 AND죠).

```
id,        group_id, subject, op,  value
c_rich_1,  cg_rich,  gold,    min, 5
c_rich_2,  cg_rich,  hp,      min, 3
```

게이트가 필요한 표(이벤트·선택지 등)는 `cond_group`으로 이 묶음을 가리키고, 비워 두면 "항상 통과"가 됩니다.

## 조건은 문장처럼

비교는 기호 대신 키워드를 써요. 엑셀이 `>=` 같은 걸 수식으로 착각하는 걸 막으려는 거예요.

| 이상 | 이하 | 초과 | 미만 | 같음 | 다름 |
|---|---|---|---|---|---|
| `min` | `max` | `over` | `under` | `is` | `not` |

`subject`에는 자원 id(`hp`·`gold`…)나 `flag.<이름>`, `status.<id>`(남은 턴), `player.<자원>`을 적고, `value`에는 숫자나 `true`/`false`를 적어요. 읽으면 그대로 문장이 됩니다 — `gold min 2`, `hp max 5`, `flag.boss_killed is true`, `status.poison min 1`. 한 가지, **OR나 괄호는 없어요**(묶음은 늘 AND예요). "이거 아니면 저거"가 필요하면 앞선 효과에서 `SET_FLAG`로 깃발을 세워 두고 `flag.x is true`로 돌아가면 됩니다.

## 맵은 자유 그래프예요

칸(`tiles`)은 `x,y`를 원하는 자리에 찍으면 그대로 그려져요. ㄹ자로 강제되지 않으니 십자든 고리든 나무 모양이든 마음대로 만들 수 있어요. 칸 사이는 `edges`로 잇는데, 한 칸에서 나가는 길이 둘 이상이면 거기가 **갈림길**이 되어 이동 중에 선택 팝업이 떠요. 이때 `label`이 비어 있으면 주 경로, 적혀 있으면 그게 갈림길 버튼의 문구가 됩니다. `cond_group`을 달면 조건을 만족할 때만 열리는 길이 되고요(주 경로 하나는 늘 비워서 열어 두는 게 안전해요).

지나가다 멈추게 하고 싶은 칸은 `tiles.stop=1`로 두면, 그 칸에 닿는 순간 남은 이동을 접고 멈춰요. 갈림길은 이렇게 구조(edges)로 만드는 게 기본이지만, 이벤트(CHOICE에서 `MOVE_TO`·`MOVE_DELTA`)로도 보조할 수 있어요.

## 고정과 랜덤, 마음대로 섞기

칸의 "타입"과 "도착 이벤트"는 따로 노는 두 축이에요. 그래서 네 조합이 다 가능해요.

| | 타입 | 도착 이벤트 |
|---|---|---|
| **고정** | `tiles.type`을 채움 (또는 `locked=1`) | `tiles.event_id`를 지정 |
| **랜덤** | `tiles.type`을 비움 → 그 칸 `region`의 `generation` 가중치로 추첨 | `tile_events`의 `tile_type` 풀에서 조건+가중치로 추첨 |

랜덤 타입이 뽑히는 범위는 그 region에 적어 둔 `generation` 줄들이에요. 특정 칸만 다른 풀을 쓰고 싶으면 전용 region을 하나 만들어 주면 됩니다. `tile_events`는 `event_id`가 비어 있는 칸에만 적용되고, `cond_group`으로 상황에 따라 풀을 달리할 수도 있어요.

## 주사위

`config.dice`에 표기로 적어요(없으면 `dice_sides`, 그것도 없으면 d6이에요).

| `d6` | `2d6` | `d20` | `3d4+2` |
|---|---|---|---|
| 6면 하나 | 6면 둘을 합산 | 20면 하나 | 4면 셋에 +2 |

## 보드 외형 (config로)

칸 색·테두리·말(토큰) 모양은 스테이지 `config`로 바꿔요(모두 선택, 비우면 기본값). 특히 **말 이미지**를 붙일 수 있어요.

- **플레이어 말**: `config.player_sprite`에 `assets.id`나 이미지 경로를 적으면 그 칸 위에 원형 이미지로 떠요. 비우면 `player_color` 색 원.
- **적 말**: `enemies` 표의 `sprite`(← `assets.id`/경로). 비우면 `enemy_color` 색 원.
- **칸/보드**: `board_bg`(배경색) · `edge_color`/`edge_width`(잇는 선) · `tile_pad`/`tile_radius`(칸 여백·둥글기) · `tile_border`/`tile_border_width`(칸 테두리 — 비우면 테두리 없음) · `locked_border`(고정 칸 강조색).
- **말 공통**: `token_stroke`(외곽선) · `token_radius`(칸 대비 말 크기 0~0.5, 기본 0.18).

색은 `#hex`, 크기는 숫자(px)예요. 이미지가 로드 안 되면 자동으로 색 원으로 폴백합니다.

## 자원·상태와 캐릭터

자원·상태는 전역 표 `stats`(`data/` 루트)에 한 벌로 모아 두고 모든 스테이지가 공유해요(플레이어가 스테이지를 넘어 들고 다니니까요). 줄을 더하면 스탯이 늘어나고, `kind`로 성격을 가릅니다. `kind=number`는 보통의 수치 자원, `kind=bool`은 0·1짜리 보유 상태예요. `decay`를 적으면 턴마다 저절로 오르내리고(음수면 줄어듦), 화면 표시는 `display`로 정해요 — `bar`는 게이지, `counter`는 숫자만, `flag`는 보유 표시(✓), `hidden`은 추적만 하고 숨기기. `visible`을 0으로 둬도 숨겨집니다. 비워 두면 알아서 골라 줘요(bool은 flag, 최대값이 있으면 bar, 나머지는 counter). 다른 표의 `target`이 이 `stats.id`를 가리켜요.

캐릭터를 쓰려면 `characters.csv`(선택)를 두면 돼요. 새 판을 시작할 때 고르게 되고, 고른 캐릭터의 초상과 이름이 config 값을 덮고, `start_effect_group`을 딱 한 번 받아요. 이 표가 없으면 그냥 `config`의 이름·초상을 씁니다.

## 한 걸음 더 — 심화 시스템

아래 표들은 모두 선택이에요. 없으면 그 기능만 조용히 꺼질 뿐, 게임은 멀쩡히 돌아갑니다.

**지속 상태** (`stats`의 `kind=status` 줄) — 독, 실드, 재생처럼 몇 턴 동안 따라붙는 상태예요. 전역 `stats` 표에 `kind=status`로 적습니다(자원과 한 표). `APPLY_STATUS` 효과로 걸고(`target`은 상태 id, `value`로 `duration`을 덮어쓸 수 있어요) `CLEAR_STATUS`로 풀어요. 매 턴 효과는 effects를 가리키지 않고 인라인으로 자족해요 — `per_turn_target`/`per_turn_amount`에 "어떤 스탯을 얼마만큼"을 적으면, 턴 시작마다 중첩 수만큼 곱해 적용하고(독은 hp −1, 재생은 hp +1) 남은 턴을 하나씩 줄이다 0이 되면 사라집니다. 조건에선 `status.<id>`로 남은 턴을 봐요. (이 인라인화 덕에 전역 `stats`가 스테이지 effects를 가리키지 않아 레이어 불변식이 지켜져요.)

**파생 스탯** (`derived.csv`, 전역) — 다른 스탯으로 자동 계산되는 스탯이에요. `target = 기본값 + Σ(입력값 × 가중치)` 꼴로, 같은 `target`의 줄을 모두 더해요(`term`이 비면 상수 항이고요). 입력 스탯이 바뀌면 알아서 다시 계산되니, 이건 **계산 전용**으로 두고 효과로 직접 건드리지 마세요. 대상·입력 모두 전역 `stats`에 선언돼 있어야 해요(전역→전역 참조).

**임계 트리거** (`thresholds.csv`) — 자원이 어떤 선을 **넘어서는 그 순간** 이벤트나 효과를 터뜨려요. `subject`/`op`/`value`로 조건을 적고(조건 표기와 같아요), `event`나 `effect`로 무엇을 터뜨릴지 정합니다. `mode`가 `once`면 판당 한 번, `repeat`면 넘을 때마다예요.

**턴 훅** — `config`의 `on_turn_start`/`on_turn_end`에 `effects.group_id`를 적으면, 매 턴 시작(상태 처리 직후)과 끝에 그 효과가 돌아요.

**VN 렌더(비주얼 노벨)** — 이벤트(`events`)에 `background`(배경 ← `assets.id` 또는 색 hex) · `speaker`(대사 창 화자명) · `sprite`(등장 캐릭터 ← `assets.id`, `kind=sprite`) 중 하나라도 채우면, 그 이벤트는 화면 ~90%를 덮는 **비주얼 노벨 화면**으로 떠요(아무것도 안 채우면 평소 팝업). 좌측에 배경+캐릭터, 우측 상단에 대사 창, 그 아래 선택지가 놓입니다. 캐릭터는 전역 `assets`에 `kind=sprite` 행으로 두고 `pos`(left/center/right)·`speaker`를 적어요(별도 표 없음). 본문·선택지·체인(`next_event`)은 일반 이벤트와 똑같이 동작하니, 대사 분기는 `next_event`로 이으면 됩니다. 이벤트당 캐릭터는 1명(정적 배치)이에요.

**적** (`enemies.csv`) — 보드 위를 돌아다니는 적이에요. `behavior`로 성격을 정하는데, `chase`는 추적, `wander`는 배회, `ambush`는 시야에 들면 달려들고, `turret`은 제자리에서 사정거리 안이면 쏘고, `ranged`는 다가오다 사거리에 들면 멈춰서 쏴요(`vision`이 그 사정거리예요). 같은 칸에서 마주치면 — `contact`가 `move`면 적이 와서, `pass`면 내가 밟고 지나가다, `both`면 어느 쪽이든 — `event`가 열려요. 보통 선택지를 띄워서, 그 선택지의 효과로 적을 처리하죠. 이때 `DEFEAT_ENEMY`(처치)·`STUN_ENEMY`(몇 턴 기절)·`PUSH_ENEMY`(몇 칸 밀어내기)가 방금 만난 그 적에게 적용됩니다.

## 검증과 엑셀 작업

다 적었으면 `npm run data:validate`로 검사하세요. 깨진 참조, 시작 칸에서 닿을 수 없는 칸, 막다른 칸, 출구가 전부 조건부라 갇힐 수 있는 갈림길 같은 걸 한 번에 짚어 줍니다. 데이터가 맞는지 최종으로 판정하는 곳이 바로 여기예요 — 플레이 전에 꼭 한 번 돌려 주세요.

엑셀로 편집하고 싶다면 `data:import`으로 워크북을 만들고, 편집한 뒤 `data:export`로 다시 CSV로 내보내면 됩니다. 참조 칸 드롭다운, 잘못된 값 빨강 표시, id 옆 이름 표시 같은 게 자동으로 붙어서 한결 수월해요. 자세한 건 [`TOOLING.md`](TOOLING.md)에 적어 뒀어요.

## 새 콘텐츠를 더할 때, 이 순서로

1. 어느 표에 줄을 더하면 되는지 떠올려 보세요. 새 칸이면 `tiles`, 새 사건이면 `events`+`effects`, 새 조건이면 `conditions` 하는 식으로요.
2. 참조하는 열이 실제로 있는 id를 가리키는지 확인해요(위 "참조 지도").
3. 한 칸에 여러 값을 넣지 않았는지 보고, 그렇다면 `group_id` 줄로 나눠 주세요.
4. `npm run data:validate`를 통과하나요?
5. 엑셀로 작업했다면 `data:export` 한 뒤 한 번 더 검사하면 안심이에요.
