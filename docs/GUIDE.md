# Dice Board 제작 가이드 — 테이블 & 엔진 사용법

> 코드를 몰라도, **CSV 표만 채우면** 새 보드게임이 나오도록 만든 엔진입니다. 이 문서는 *각 표가 무슨 일을 하고, 어떤 칸에 무엇을 적으며, 엔진이 그걸 어떻게 쓰는지*를 처음부터 끝까지 풀어 설명합니다. (표 작성 실전 요령은 `AUTHORING.md`, 엑셀 도구는 `TOOLING.md`, 표 구조도는 `ERD.md` 참고.)

---

## 0. 큰 그림 — 무엇이 어디에 있나

데이터는 **두 레이어**로 나뉩니다.

| 레이어 | 위치 | 들어가는 표 | 수명 |
|---|---|---|---|
| **전역(런)** | `public/resources/data/` 루트 | `stats` · `generation` · `assets` · `derived` · `stages` · `meta` · `ui` | 게임 전체에서 공유 |
| **스테이지** | `public/resources/data/<스테이지>/` | `config` · `tiles` · `edges` · `events` · `choices` · `effects` · `conditions` · `tile_events` · (선택)`endings`/`characters`/`enemies`/`items`/`thresholds` | 그 보드 한 판 |

핵심 규칙: **스테이지 표는 전역 id를 자유롭게 가리킬 수 있지만, 전역 표는 스테이지를 가리키지 않습니다.** 그래서 스테이지를 갈아끼워도 자원/이미지 정의는 그대로입니다.

> **진실의 원본은 언제나 CSV입니다.** 엑셀 워크북은 작업 편의용 사본일 뿐이고, 데이터가 맞는지 최종 판정은 `npm run data:validate`가 합니다.

---

## 1. CSV 작성 규칙 (공통)

- **3행 헤더**: 1행=한글 이름(사람용), **2행=변수명(엔진이 읽는 키)**, 3행=타입(int/float/string/bool). 4행부터 실제 데이터. → 엔진은 *2행 변수명*만 봅니다. 1·3행은 사람을 위한 안내입니다.
  - 단, `config`/`ui`처럼 `key,value` 두 칸짜리 표는 "키 이름, 값"을 행마다 적습니다.
- **빈 칸 = 미설정**: 비우면 기본값으로 동작합니다(아래 각 표의 기본값 참고).
- **콤마가 든 값은 따옴표로**: 예) `menu_bg,"radial-gradient(... , ...)"`. 본문 텍스트에 콤마가 있으면 `"HP -1, 골드 -1."`처럼 감쌉니다.
- **한글 깨짐 방지**: 저장은 UTF-8 BOM. `npm run data:bom`이 일괄로 BOM을 붙여줍니다.
- **참조는 id로**: 표 사이 연결은 전부 id 문자열입니다(예: `tiles.event_id` → `events.id`). 같은 값끼리 묶는 `group_id`도 참조값입니다.

---

## 2. 새 스테이지 만들기 (빠른 순서)

1. `public/resources/data/내스테이지/` 폴더를 만들고 스테이지 표 8종을 둡니다: `config, tiles, edges, events, choices, effects, conditions, tile_events`. (나머지는 선택)
2. `config.csv`에 최소 `start_tile`을 적습니다(목표가 있으면 `goal_tile`도).
3. `tiles.csv`에 칸을, `edges.csv`에 칸 사이 길을 잇습니다.
4. 칸에 사건을 붙이려면 `events.csv`를 쓰고, 타일의 `event_id`로 고정하거나 `tile_events.csv`로 타입별 풀에서 뽑게 합니다.
5. 전역 `stages.csv`에 한 줄 추가해 등록합니다(`config_path`는 `/resources/data/내스테이지/`).
6. `npm run data:validate`로 점검 → 0/0이면 OK. `npm run dev`로 실행.

> 빈 `id`를 자동 채우거나 표를 만들어 주는 도구는 `csv-tool.bat`(메뉴) / `npm run data:*` 참고.

---

## 3. 전역 표 (런 단위)

### 3.1 `stats.csv` — 자원 · 능력치 · 지속 상태 (통합)
플레이어가 들고 다니는 모든 수치. `kind`로 종류를 가릅니다. (구버전의 resources + statuses가 하나로 합쳐짐)

| 칸 | 뜻 |
|---|---|
| `id` | 참조 이름(효과·조건이 이걸로 지목). 예 `hp` |
| `label` `icon` | 표시 이름 / 아이콘(이모지 또는 `heart`·`coin`·`torch` 키워드) |
| `kind` | `number`(수치) · `bool`(보유 0/1) · `status`(지속 상태) |
| `min` `max` | 값 한계(비우면 무제한, 범위 밖은 잘림) |
| `start` | 시작값 |
| `decay` | 턴마다 자동 증감(음수=감소). 굶주림/온기용 |
| `visible` | 1=HUD 표시, 0=추적만 |
| `display` | `bar`(게이지)·`counter`(숫자)·`flag`(✓)·`hidden`. 빈=자동 |
| `duration` `max_stacks` | (kind=status) 기본 지속 턴 / 중첩 한도 |
| `per_turn_target` `per_turn_amount` | (kind=status) 매 턴 이 stat을 이만큼 증감(독=hp −1, 재생=hp +1) |

### 3.2 `generation.csv` — 빈 칸 자동 채움 규칙
`tiles.csv`에서 `type`이 빈 칸을, 그 칸의 `region`에 맞춰 가중치로 뽑아 채웁니다.

| 칸 | 뜻 |
|---|---|
| `region` | 지역 키(tiles.region과 매칭) |
| `tile_type` | 채워 넣을 칸 타입 |
| `weight` | 추첨 가중치(클수록 자주) |

### 3.3 `assets.csv` — 이미지/오디오/VN 스프라이트 등록부
경로에 이름표를 붙여 두면 다른 표가 그 id로 가리킵니다. **경로는 `/`로 시작하는 절대경로 권장**(전역이라 스테이지 폴더 기준 상대경로는 어긋남).

| 칸 | 뜻 |
|---|---|
| `id` `kind` `path` | 이름 / `image`·`audio`·`sprite` / 파일 경로 |
| `speaker` `expr` `pos` | (kind=sprite, VN 전용) 기본 화자명 / 표정 태그 / 위치 `left`·`center`·`right` |

### 3.4 `derived.csv` — 파생 스탯(자동 계산)
다른 stat들의 **선형결합**으로 자동 계산되는 stat. (예: 전투력 = 1 + 횃불 + 지도×3) `eval` 없이 안전하게 합산합니다.

| 칸 | 뜻 |
|---|---|
| `target` | 결과를 담을 stat id(stats에도 선언돼 있어야 함) |
| `term` | 입력 stat id(비우면 상수 항) |
| `factor` | 가중치(term 있으면 곱, 없으면 그대로 더함) |

같은 `target` 행을 모두 더합니다. 입력 stat이 바뀌면 자동 재계산됩니다.

### 3.5 `stages.csv` — 스테이지 목록
메뉴/스테이지 선택에 뜨는 보드 목록.

| 칸 | 뜻 |
|---|---|
| `id` `name` `description` `icon` | 식별 / 표시 이름 / 설명 / 아이콘 |
| `config_path` | 그 스테이지 폴더 경로(예 `/resources/data/hero/`) |
| `unlock_cost` | 해금 비용(0=처음부터 열림). 메타 포인트로 해금 |

### 3.6 `meta.csv` — 런 간 영구 업그레이드
한 판이 끝나도 남는 강화. 모은 메타 포인트로 구매.

| 칸 | 뜻 |
|---|---|
| `id` `label` `description` | 식별 / 이름 / 설명 |
| `cost` `value` `max_rank` | 한 랭크 비용 / 랭크당 효과량 / 최대 랭크 |
| `effect_kind` `target` | 적용 방식(GAIN 등) / 대상 stat id(런 시작 시 반영) |

### 3.7 `ui.csv` — 외형 테마 (코드 수정 없이 꾸미기) 🎨
`key,value` 형태. 부팅 시 읽어 **CSS 변수로 주입**하거나 메뉴 콘텐츠로 씁니다. 파일이 없으면 기본 테마.

| 키 | 효과 | 예 |
|---|---|---|
| `app_name` | 시작화면 제목 | `룬과 주사위` |
| `app_tagline` | 시작화면 부제 | `데이터로 빚는 모험` |
| `menu_bg` | 시작화면 배경 **색/그라데이션**(이미지 아래 깔림) | `"radial-gradient(...)"` |
| `menu_bg_image` | **시작화면 배경 이미지(교체)** — 경로만 적으면 cover로 깔림 | `/resources/images/ui_bg_menu.png` |
| `stage_bg_image` `result_bg_image` `meta_bg_image` | 스테이지선택 / 결과 / 업그레이드 화면 배경 이미지 | `/resources/images/foo.png` |
| `btn_image` | 버튼 배경 이미지(스킨). 비면 `accent` 색 버튼 | `/resources/images/btn.png` |
| `accent` `accent_dim` | 강조색(버튼 등) / 진한 강조색 | `#e0a23c` |
| `bg` `card` `border` `text` `muted` | 배경/카드/테두리/본문/흐린 글자색 | `#1a1d22` |
| `font_family` | 전체 글꼴 | `"Pretendard, sans-serif"` |
| `ui_radius` | 버튼 등 모서리 반경 | `12px` |

> 색 토큰(`accent`/`bg`/…)은 화면 전체가 이미 `var(--accent)` 식으로 쓰고 있어, **한 줄만 바꿔도 UI 전체 색이 바뀝니다.**
>
> **배경/버튼 이미지**: `*_bg_image`·`btn_image`는 **경로만** 적으면 됩니다(엔진이 `url("...")`로 감싸 `cover`·`center`로 깔고, 비우면 그 아래 색/그라데이션이 보임). 시작화면 배경 교체가 대표 용도입니다.
>
> 새 토큰/이미지 슬롯이 더 필요하면 `src/core/theme.ts`의 `VAR_KEYS`(색·값) 또는 `IMAGE_KEYS`(이미지)에 키→CSS변수 한 줄 + index.html의 해당 CSS에 `var(--…)` 한 번이면 확장됩니다. (인게임 보드 배경은 canvas가 칠하므로 VN 이벤트의 `background`로 연출하세요.)

---

## 4. 스테이지 표

### 4.1 `config.csv` — 이 보드의 전역 설정 (`key,value`)
| 키 | 뜻 |
|---|---|
| `start_tile` *(필수)* `goal_tile` | 시작 칸 / 도달 시 승리하는 칸 |
| `board_name` `player_name` `portrait` | 보드 이름 / 캐릭터 이름 / 초상(이모지 또는 경로) |
| `seed` | 보드 셔플 시드(비우면 매번 랜덤, 값 있으면 고정) |
| `dice` `dice_sides` | 주사위 표기(`2d6`/`d20`/`d6+1`) / 단일 주사위 면 수 |
| `generator` | 빈 칸 생성기(기본 weighted) |
| `lose_cond_group` | 패배 판정 조건 그룹(비우면 hp ≤ 0) |
| `on_turn_start` `on_turn_end` | 매 턴 시작/끝에 실행할 효과 그룹 |
| `bgm` | 배경음 assets.id(또는 경로) |
| **이미지 규격** `portrait_size` `portrait_fit` | 포트레이트 한 변(px) / `cover`·`contain`·`fill` |
| `popup_art_height` `popup_art_fit` | 이벤트 팝업 아트 높이 / 맞춤 |
| `result_art_size` `result_art_fit` | 결과 화면 아트 크기 / 맞춤 |
| `char_body_width` | 캐릭터 패널 텍스트 영역 폭(포트레이트 커지면 패널이 함께 넓어짐) |

### 4.2 `tiles.csv` — 보드의 칸
| 칸 | 뜻 |
|---|---|
| `id` `x` `y` | 식별 / 격자 좌표 |
| `type` | `start`·`goal`·`boon`·`trap`·`hazard`·`event`·`shortcut`·`setback`·`shop`·`shrine`·`empty`. 비우면 생성기가 채움 |
| `sprite` | 칸 그림 ← assets.id(비우면 색) |
| `event_id` | 도착 시 꼭 터질 이벤트(비우면 type 풀에서 추첨) |
| `region` | 지역(생성기 가중치용) |
| `locked` | 1=생성기가 안 건드림(수동 배치 보존) |
| `label` `stop` | 이름표 / 1=지나가다 닿으면 강제 정지 |

### 4.3 `edges.csv` — 칸과 칸을 잇는 길 (방향 있음)
| 칸 | 뜻 |
|---|---|
| `from` `to` | 출발/도착 칸 id |
| `label` | 비면 주 경로. 글을 적으면 **갈림길**에서 그 글이 선택 버튼 |
| `cond_group` | 통행 조건(비면 항상). 한 칸의 출구가 2개↑이면 갈림길 팝업 |

### 4.4 `events.csv` — 사건 스크립트 (★핵심)
| 칸 | 뜻 |
|---|---|
| `id` | 식별 |
| `type` | `EFFECT`(효과/메시지) · `CHOICE`(선택지) · `MOVE`(이동) · `NONE` |
| `cond_group` | 발동 조건(비면 항상) |
| `probability` | 0~1 발동 확률(기본 1) |
| `payload` | 실행할 효과 그룹 ← `effects.group_id` (MOVE면 `move:3` 단축도 가능) |
| `title` `text` `icon` `image` | 제목 / 본문 / 이모지 / 팝업 이미지 경로 |
| **VN** `background` | 배경 ← assets.id(image) 또는 `#색`. *있으면 VN 오버레이로 표시* |
| `speaker` | 대사 창 화자명(비면 sprite 화자 폴백) |
| `sprite` | 등장 캐릭터 ← assets.id(kind=sprite) |

> **VN 라우팅**: `background`나 `sprite`가 있으면 풀스크린 **VN 오버레이**(좌 배경+캐릭터, 우 대사창+선택지)로, 없으면 기존 팝업으로 자동 분기됩니다. 분기 대화는 `choices.next_event` 체인을 재사용합니다.

### 4.5 `choices.csv` — CHOICE 이벤트의 선택지
| 칸 | 뜻 |
|---|---|
| `event_id` `choice_id` `text` | 소속 이벤트 / 선택지 식별 / 버튼 문구 |
| `cond_group` | 활성 조건(미충족 시 비활성). 전부 비활성이면 "지나간다" 자동 추가 |
| `result_effect_id` | 고르면 실행할 효과 그룹 ← `effects.group_id` |
| `next_event` | 고른 뒤 이어서 실행할 이벤트(연속 선택지/체인) |

### 4.6 `effects.csv` — 행동 원자 (★핵심)
한 행 = 효과 하나. 같은 `group_id`끼리 `seq` 순서로 묶여 실행됩니다(이벤트 payload·선택지 결과·캐릭터 시작효과·아이템 사용 등이 group_id로 가리킴).

| 칸 | 뜻 |
|---|---|
| `id` `group_id` `seq` | 행 식별 / 참조 묶음 키 / 그룹 내 실행 순서 |
| `kind` | 효과 종류(아래 표) |
| `target` `value` | 종류별 의미(대상 stat/플래그/아이템/이벤트 id, 값) |

**효과 종류 16종:**

| kind | 하는 일 |
|---|---|
| `GAIN` / `LOSE` | target stat을 value만큼 증가/감소 |
| `SET` | target stat을 value로 설정 |
| `MOVE_DELTA` | value 칸 이동(음수=뒤로) |
| `MOVE_TO` | value 칸으로 순간이동 |
| `SKIP_TURN` | 다음 턴 쉼 |
| `SET_FLAG` | target 플래그를 value로(조건 `flag.x`로 참조) |
| `MSG` | value 메시지 표시 |
| `RUN_EVENT` | target 이벤트를 이어 실행(이벤트 체인) |
| `APPLY_STATUS` / `CLEAR_STATUS` | target(kind=status인 stat) 지속 상태 부여/해제. value=지속 override |
| `GIVE_ITEM` / `TAKE_ITEM` | target 아이템 value개 지급/회수(기본 1) |
| `DEFEAT_ENEMY` / `STUN_ENEMY` / `PUSH_ENEMY` | 접촉 이벤트의 "현재 적"을 처치/정지/후퇴 (전투 접촉 중에만 유효) |

### 4.7 `conditions.csv` — 조건(게이트)
같은 `group_id`의 술어가 **모두 참**이면 통과(AND). 이벤트 발동·선택지 활성·통행·엔딩·임계 등 곳곳의 `cond_group`이 가리킵니다.

| 칸 | 뜻 |
|---|---|
| `id` `group_id` | 행 식별 / 참조 묶음 키 |
| `subject` | `<stat id>` · `flag.<이름>` · `status.<id>`(남은 턴) · `item.<id>`(보유 수) · `player.<stat>` |
| `op` | `min`(≥) · `max`(≤) · `over`(>) · `under`(<) · `is`(=) · `not`(≠) |
| `value` | 숫자 또는 `true`/`false` |

### 4.8 `tile_events.csv` — 타일 타입별 이벤트 풀
타일에 `event_id`가 없을 때, 그 타일 `type`에 맞는 이벤트를 가중치로 뽑습니다.

| 칸 | 뜻 |
|---|---|
| `tile_type` `event_id` `weight` | 칸 타입 / 뽑힐 이벤트 / 가중치 |
| `cond_group` | 미충족 시 풀에서 제외 |

### 4.9 선택 표
| 표 | 무엇 | 주요 칸 |
|---|---|---|
| `endings.csv` | 멀티 엔딩(종료 시 조건으로 선택) | `when`(victory/defeat/any) · `cond_group` · `priority` · `title`/`text`/`icon`/`image` |
| `characters.csv` | 시작 시 캐릭터 선택 | `name` · `portrait` · `desc` · `start_effect_group`(시작 효과) · `icon` |
| `enemies.csv` | 보드 위 적 | `start`(시작 칸) · `behavior` · `speed` · `damage` · `event`(접촉 이벤트) · `vision` · `contact`(move/pass/both) · `sprite` · `cond_group` |
| `items.csv` | 인벤토리 아이템 | `name` · `icon` · `desc` · `use_effect_group`(사용 효과) · `consumable`(1=소모) · `max_stack`(0=무제한) · `cond_group`(사용 조건) |
| `thresholds.csv` | 임계 트리거(값이 선을 넘는 순간 발동) | `subject`/`op`/`value` · `event` 또는 `effect` · `mode`(once/repeat) |

> 선택 표는 `stage:new` 골격에 포함되지 않아요(파일이 없으면 그 기능만 꺼진 상태). 필요해지면 `csv-tool.bat`의 **[7] 선택 표 관리** 메뉴나 `node tools/csv-sync.mjs table:add <스테이지> <표>`로 켜면 — 3행 헤더 CSV가 생기고 워크북 시트·드롭다운까지 같이 갖춰집니다. 끌 때는 `table:rm`(필수 표는 거부).

---

## 5. 엔진 동작 요점 (표 → 행동)

- **턴 흐름**: 주사위 → 칸 이동(갈림길이면 길 선택) → 도착 이벤트 → 임계 검사 → 적 이동/공격 → 턴 끝 훅. 매 턴 시작에 자원 `decay`·상태 `per_turn` 틱.
- **이벤트 → 효과**: 이벤트가 `payload`(effects.group_id)를 실행. CHOICE면 선택지의 `result_effect_id` 실행 후 `next_event`로 이어짐(체인, 최대 깊이 32).
- **아이템 사용**: 칩 클릭 → `use_effect_group` 실행. **주사위 굴리기 전(턴 대기)에만** 가능, 소모성이면 1개 차감. 효과 종류 전부 사용 가능(이동·이벤트 발생 포함). 단 적 처치 효과는 전투 접촉 중에만 유효.
- **VN 오버레이**: events의 `background`/`sprite`가 있으면 자동 VN 모드. 배경(이미지/색) + pos별 캐릭터 스프라이트 + 대사창 + 선택지. 이미지 로드 실패 시 이모지(`icon`)로 폴백.
- **이미지 규격 / 패널**: `config`의 `portrait_size`·`popup_art_height` 등으로 **규격(카테고리) 단위** 크기·맞춤을 조정. 포트레이트를 키우면 캐릭터 패널이 함께 넓어짐(`char_body_width`로 텍스트 영역 폭 조정).
- **외형 테마**: 전역 `ui.csv`로 색/폰트/배경/이름을 코드 수정 없이 변경(§3.7).
- **새 효과/행동 추가(코드)**: 정말 새로운 *종류*가 필요하면 `src/effects/effects.ts`에 `registerEffect("KIND", …)` 한 줄, 적 행동은 `src/core/behaviors.ts`에 `registerBehavior(...)` 한 줄. 대부분은 코드 없이 데이터로 해결됩니다. 적 행동 스크립트의 작성법·API·체크리스트는 [AI-BEHAVIORS.md](AI-BEHAVIORS.md)에 따로 정리해 뒀어요.

---

## 6. 도구 (npm 스크립트)

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입체크 + 프로덕션 빌드 |
| `npm run data:validate` | **데이터 무결성 검사**(참조·구조·VN/아이템 FK 등). 권위 있는 판정 |
| `npm run data:bom` | 전 CSV에 UTF-8 BOM 부여(엑셀 한글) |
| `npm run data:import` / `data:export` | CSV ↔ 엑셀 워크북 왕복(작업 편의 사본) |
| `node tools/make-vn-pngs.mjs` | VN 테스트용 실제 PNG(배경/캐릭터) 생성 예시 |

---

## 7. 자주 쓰는 레시피

- **HP를 깎는 함정 칸**: tiles에 `type=trap` 칸 → tile_events(trap → 이벤트) 또는 직접 `event_id` → events(EFFECT, payload=ef_trap) → effects(`ef_trap` / LOSE / hp / 2).
- **조건부 선택지**: choices에 `cond_group` 지정 → conditions에 그 group의 술어(예 `gold min 5`). 못 채우면 회색 비활성.
- **VN 대사 장면**: assets에 `kind=sprite` 캐릭터 + 배경 image → events에 `background`/`sprite`/`speaker` 채우기 → CHOICE면 분기까지.
- **회복 물약 아이템**: items(`it_potion`, use_effect_group=`ef_heal`) + effects(`ef_heal`/GAIN/hp/5). 이벤트나 캐릭터 시작효과에서 `GIVE_ITEM it_potion`으로 지급.
- **테마 바꾸기**: `ui.csv`에서 `accent`·`menu_bg`·`app_name`만 고치고 새로고침.

> 막히면 `npm run data:validate`부터. 어느 표의 어떤 참조가 비었는지 콕 집어줍니다.
