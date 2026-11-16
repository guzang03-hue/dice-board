# UI 제어 키 레퍼런스

UI의 외형·배치·동작을 **표에서** 제어하는 키 목록이에요. 전부 기존 key/value 테이블에 **행을 추가**하는 것만으로 동작합니다(칼럼·테이블 구조 불변).

- **어디에 적나** — 전역 기본값은 `data/ui.csv`, 스테이지별 값은 `data/<스테이지>/config.csv`. 같은 키가 양쪽에 있으면 **스테이지가 이깁니다**. 안 적으면 코드 기본값(아래 표의 "기본").
- **값 규약** — 불리언은 `1`/`0`(또는 `true`/`false`), enum은 소문자. 숫자는 한계 밖이면 한계로 잘리고, 못 읽는 값이면 기본값으로 동작해요(게임이 깨지지 않음).
- 키를 추가/변경한 뒤 `npm run data:validate`를 돌리면 오타(미지 키)를 경고로 짚어 줍니다.
- 구현: 키 선언은 `src/ui/UiSettings.ts`, 검증 목록은 `tools/schema-meta.mjs`의 `UI_SETTING_KEYS`. 새 키를 만들면 **두 곳 다** 추가하세요.

## 보드(타일 화면) 카메라 — 확대·축소·이동

| 키 | 타입 | 기본 | 의미 |
| --- | --- | --- | --- |
| `board_zoom` | bool | 1 | 줌 기능 전체 on/off (휠·핀치·버튼) |
| `board_zoom_min` / `board_zoom_max` | float | 0.5 / 3 | 배율 한계 |
| `board_zoom_default` | float | 1 | 시작 배율 (1=화면 자동 맞춤) |
| `board_zoom_step` | float | 0.15 | 휠/버튼 1회 증분 |
| `board_pan` | bool | 1 | 드래그로 보드 끌기 |
| `board_zoom_buttons` | bool | 1 | 보드 우상단 ＋/－/⟲ 버튼 표시 |
| `board_follow_player` | bool | 0 | 확대 중 이동 시 토큰을 화면 중앙에 유지 |
| `board_fit_padding` | px | 24 | 자동 맞춤 여백 |
| `board_cell_min` / `board_cell_max` | px | 24 / 96 | 자동 맞춤 칸 크기 한계 |

조작: 마우스 휠 = 커서 기준 줌, 드래그 = 이동, 더블클릭/⟲ = 원래대로, 터치 = 핀치·드래그.

## 포트레이트·캐릭터 패널

| 키 | 타입 | 기본 | 의미 |
| --- | --- | --- | --- |
| `portrait_size` | px | 52 | 초상 한 변 |
| `portrait_fit` | enum | cover | cover/contain/fill |
| `portrait_radius` | string | 10px | 모서리. `50%`=원형 |
| `portrait_border` | color | (테마) | 초상 테두리 색 |
| `char_body_width` | px | 122 | 이름/게이지 영역 폭 |
| `char_panel_pos` | enum | tl | 패널 모서리 tl/tr/bl/br |
| `char_panel_x` / `char_panel_y` | px | 12 | 모서리로부터 여백 |
| `char_panel_opacity` | float | 0.82 | 패널 배경 불투명도 0~1 |
| `char_panel_scale` | float | 1 | 패널 전체 배율 |
| `char_name_size` | px | 14 | 이름 글자 크기 |
| `char_panel_max_width` | string | min(80vw, 520px) | 최대 폭(CSS 길이) |

## 전체·영역 배율

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `ui_scale` | 1 | 보드 캔버스를 뺀 UI 전체 배율 (0.5~2.5) |
| `hud_scale` `log_scale` `popup_scale` `vn_scale` `footer_scale` | 1 | 영역별 추가 배율 — `ui_scale`에 곱해짐 |

## 표시 토글·배치

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `show_header` `show_progress` `show_log` `show_dice_result` `show_status` | 1 | 헤더/진행도 바/이벤트 로그/주사위 결과/위치 표시줄 |
| `log_pos` | br | 로그 모서리 br/bl/tr/tl |
| `log_width` | 180px | 로그 폭 |
| `log_max_lines` | 10 | 로그 최대 줄 수 |
| `log_font_size` | 11px | 로그 글자 크기 |
| `progress_height` | 16px | 진행도 바 높이 |

## 애니메이션

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `anim_step_ms` | 220 | 토큰 한 칸 이동 시간(ms). 0에 가깝게 줄이면 즉시 이동 |
| `enemy_step_ms` | 120 | 적 한 칸 이동 간격(ms) |
| `anim_speed` | 1 | 전체 배속(2=두 배 빠르게). 위 둘을 나눠 적용 |

## 팝업·이벤트 아트·결과 아트

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `popup_min_width` / `popup_max_width` | 300 / 460px | 팝업 폭 한계 |
| `popup_radius` | 12px | 팝업 모서리 |
| `popup_art_height` | 120px | 이벤트 아트 높이 |
| `popup_art_fit` | cover | cover/contain/fill |
| `result_art_size` | 160px | 결과(엔딩) 아트 한 변 |
| `result_art_fit` | contain | cover/contain/fill |

## VN(비주얼 노벨) 오버레이

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `vn_frame_width` / `vn_frame_height` | 92% / 88% | 프레임 크기(CSS 길이) |
| `vn_side_width` | minmax(260px, 28%) | 우측 텍스트/선택지 칼럼 폭 |
| `vn_text_size` | 14px | 본문 글자 크기 |
| `vn_dim` | 0.72 | 배경 어둡기 0~1 |

## 오디오

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `bgm_volume` | 0.3 | 배경음 볼륨 0~1 |
| `sfx_volume` | 0.6 | 효과음 볼륨 0~1 |

## 칩·타일 라벨·연출

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `status_chip_size` | 11px | 상태 칩 글자 크기 |
| `inv_chip_size` | 16px | 인벤토리 칩 글자(아이콘) 크기 |
| `hud_bar_color.<stat_id>` | (휴리스틱) | 해당 스탯 게이지 색(#hex). 예: `hud_bar_color.stamina,#44cc88` |
| `tile_label_mode` | full | 칸 하단 텍스트: full=label 없으면 id, short=label 있는 칸만, none=숨김 |
| `tile_type_label` | 1 | 칸 상단 타입 텍스트(SHOP 등) 표시 |
| `dice_anim` | none | none/spin — spin이면 결과 공개 전 눈금이 잠깐 돌아감(표시 전용, 시드 무관) |
| `dice_anim_ms` | 600 | spin 연출 시간(ms) |
| `vn_text_speed` | 0 | VN 본문 타자기 효과(글자당 ms). 0=즉시. 출력 중 텍스트 창 클릭=전체 표시 |
| `log_history` | 0 | 1이면 이벤트 로그 클릭 시 이번 런 전체 로그 모달. 켜면 로그 영역이 클릭을 가로채는 점 유의 |

## 키보드 단축키

값은 `KeyboardEvent.key` 소문자(스페이스바는 `space`). **빈 값을 적으면 비활성.** 팝업/VN/히스토리 모달이 열려 있는 동안은 무시됩니다.

| 키 | 기본 | 동작 |
| --- | --- | --- |
| `hotkey_roll` | space | 주사위 굴리기 |
| `hotkey_mute` | m | 음소거 토글 |
| `hotkey_zoom_in` / `hotkey_zoom_out` | = / - | 보드 줌 |
| `hotkey_zoom_reset` | 0 | 카메라 원위치 |

## 텍스트 치환 (이벤트·선택지·MSG)

`events`/`choices`의 `title`·`text`, `effects`의 MSG 텍스트 안에서 `{토큰}`을 적으면 **표시되는 순간의 값**으로 바뀝니다. 번역(strings) 텍스트에도 동일하게 적용돼요.

| 토큰 | 의미 | 예 |
| --- | --- | --- |
| `{hp}` | 자원/파생 스탯 현재 값 | `현재 체력 {hp}/{hp.max}` |
| `{hp.max}` `{hp.min}` | 스탯 한계값 | |
| `{flag.이름}` | 플래그 값 | `{flag.boss_killed}` |
| `{status.id}` | 상태 남은 턴(없으면 0) | `독이 {status.poison}턴 남았다` |
| `{item.id}` | 아이템 보유 수 | `물약 {item.potion}개` |

모르는 토큰은 치환하지 않고 그대로 보여요 — 화면에 `{hpp}`가 보이면 오타라는 뜻입니다.

## 범용 통로 — `cssvar.<이름>`

선언에 없는 CSS 변수를 그대로 주입해요. 예를 들어 `cssvar.--cursor` 행을 적으면 `--cursor` 변수가 만들어집니다. 코드 수정 없이 새 외형 변수를 실험할 때 쓰세요(미지 키 경고에서도 제외).

## 보드 외형 키 (기존 — 이제 ui.csv에서도 사용 가능)

`board_bg` `edge_color` `edge_width` `tile_pad` `tile_radius` `tile_border` `tile_border_width` `locked_border` `player_color` `enemy_color` `token_stroke` `token_radius` — 의미는 [AUTHORING.md](AUTHORING.md)/엑셀 도움말 참고. 원래 config 전용이었지만 이제 전역 `ui.csv`에 적어 모든 스테이지의 기본값으로 둘 수도 있어요.
