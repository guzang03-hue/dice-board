# UI 확장 계획 (v1.6.0)

> 상태: **M1~M5 코어 구현 완료** (2026-06-10). 키 레퍼런스는 [UI-KEYS.md](UI-KEYS.md), 키 선언은 `src/ui/UiSettings.ts`.
> 3절 아이디어 중 구현 완료: 커서 스킨·칩 스타일·HUD 게이지 색(`hud_bar_color.<stat>`)·타일 라벨 모드·주사위 연출·VN 타자기·로그 히스토리·키보드 단축키. 추가로 **텍스트 치환**(`{hp}`·`{flag.x}`·`{status.x}`·`{item.x}` — EventEngine.fill) 구현.
> 미구현 잔여분: 접근성 묶음(reduce_motion 등)·데미지 연출(fx_*)·테마 프리셋·미니맵·런타임 설정 패널.
> 전제: **모든 테이블의 구조(파일 목록·칼럼)는 칼럼 단위까지 절대 바꾸지 않는다.**
> 모든 확장은 기존 key/value 테이블(`ui.csv` 전역, `config.csv` 스테이지)에 **행(키)을 추가**하는 것만으로 표현한다.

---

## 0. 왜 이 방식이 가능한가 (현황 분석)

이미 엔진에 "테이블 → UI" 통로(seam)가 4개 깔려 있고, 전부 키 추가만으로 확장 가능한 구조다.

| 통로 | 위치 | 지금 하는 일 |
| --- | --- | --- |
| `ui.csv` → CSS 변수 | `src/core/theme.ts` (`VAR_KEYS`/`IMAGE_KEYS`) | 색·폰트·배경 이미지·버튼 스킨을 `:root` CSS 변수로 주입 |
| `config.csv` → CSS 변수 | `GameScene.applyImageSpecs()` | 포트레이트/팝업 아트/결과 아트의 크기·fit (`--portrait-size` 등) |
| `config.csv` → 캔버스 스타일 | `GameScene.buildBoardStyle()` → `CanvasRenderer.setStyle()` | 보드 배경·엣지·타일 패딩/둥글기·토큰 색/크기 |
| `config.csv` → 게임 규칙 | `GameScene.boot()` 곳곳 | dice·bgm·on_turn_* 훅 등 |

구조적 근거:

- `GameConfig`는 `[k: string]: unknown` 인덱스 시그니처를 가짐 (`src/data/schema.ts:31`) — **새 키를 추가해도 타입/파서 수정 불필요.**
- `theme.ts`는 ui.csv 전체를 `raw` 맵으로 보관 — 확장 키 직접 참조 가능.
- `tools/validate.mjs`는 config/ui의 **미지 키를 거부하지 않음** (key 중복 검사·알려진 키의 의미 검증만 함). 즉 새 키를 추가해도 `data:validate` 통과.
- `tools/schema-meta.mjs`의 config/ui `SCHEMA.cols`는 `key,value` 두 칼럼뿐 — 키 추가는 스키마 변경이 아님. (`INFO` 도움말에 새 키 설명을 **추가**하는 것은 문서 보강이지 구조 변경이 아님.)

현재의 한계(이번 확장의 대상):

- `CanvasRenderer.fit()`이 보드를 화면에 자동 맞춤(cellPx 24~96 고정 클램프)만 함 — **줌/팬 없음.**
- CSS 변수 주입이 `applyImageSpecs`(개별 키 하드코딩)와 `theme.ts`(별도 키 목록)에 분산 — 키 하나 늘릴 때마다 코드 두 곳을 알아야 함.
- 레이아웃 수치(패널 위치, 로그 크기, 폰트 크기, 애니메이션 속도)는 index.html/코드에 박혀 있음.

---

## 1. 설계 원칙

1. **행 추가만.** 새 칼럼·새 필수 테이블 금지. 모든 신규 제어점은 `ui.csv`(전역) 또는 `config.csv`(스테이지) 키.
2. **3단 캐스케이드.** `코드 기본값 ← ui.csv(전역) ← config.csv(스테이지)`. 스테이지가 적은 키가 전역을 덮는다. 빈 값/미기재는 한 단계 아래로 폴백 — 기존 동작과 100% 호환(키를 안 적으면 지금과 동일).
3. **단일 해석기.** 키 파싱(숫자/불리언/enum/클램프)을 한 모듈(`UiSettings`)로 모은다. 이후 키 추가 = "표 1줄 + 선언 1줄".
4. **범용 통로 하나.** `cssvar.<이름>` 접두 키는 임의 CSS 변수로 그대로 주입 — 코드 수정 없이도 테이블에서 새 외형 제어가 가능한 탈출구를 마련한다.
5. **검증은 경고로.** validate.mjs에 "알려진 UI 키 목록"을 더해 오타를 **경고(warn)** 로 잡되, 미지 키를 에러로 막지는 않는다(범용 통로·실험 키 보호).

### 키 네이밍 규약 (제안)

- 보드(캔버스): `board_*` — 예 `board_zoom_max`
- 캐릭터 패널: `char_panel_*`, `portrait_*`
- HUD/로그/진행도: `hud_*`, `log_*`, `progress_*`
- 팝업/VN: `popup_*`, `vn_*`
- 전체: `ui_*` — 예 `ui_scale`
- 범용 CSS 변수: `cssvar.<var-name>`
- 불리언은 `1/0` 또는 `true/false`(엔진의 `boolFlag` 규약 그대로), enum은 소문자.

---

## 2. 마일스톤

### M1 — UI 설정 인프라 (다른 모든 것의 토대)

**목표:** 키 추가가 "선언 1줄"이 되는 해석 계층.

- `src/ui/UiSettings.ts` 신설:
  - 입력: theme의 `raw`(ui.csv) + 스테이지 `config` 맵 → 병합(캐스케이드).
  - 선언적 키 정의: `{ key, kind: px|number|color|enum|bool|string, min?, max?, cssVar?, default }`.
  - `cssVar`가 있는 키는 일괄로 `:root`(전역 키) 또는 `#panel-game`(스테이지 키)에 주입 → 씬 이탈 시 스테이지 키가 전역을 오염시키지 않음.
- `theme.ts`의 `VAR_KEYS`/`IMAGE_KEYS`, `GameScene.applyImageSpecs()`를 UiSettings 선언으로 이관(동작 동일, 기본값 동일).
- `cssvar.<이름>` 범용 통로 구현 (ui.csv·config.csv 양쪽).
- 문서: AUTHORING.md에 키 목록 표 추가, schema-meta `INFO.config`/`INFO.ui`에 행 설명 추가.

**리스크:** 기존 키 기본값 회귀. → 이관 전후 CSS 변수 스냅샷 비교로 검증.

### M2 — 보드(타일 화면) 줌/팬

**목표:** 인게임 보드 확대·축소·이동. 전부 config로 제어.

**구현 개요** — `CanvasRenderer`에 카메라 도입:

- `fit()`이 계산한 배율을 `baseCell`로 두고, 실제 `cellPx = baseCell × zoom`. `tileToScreen()`이 좌표 계산을 독점하고 있어(토큰 애니메이션 `tileCenter()` 포함) 여기만 고치면 전체가 따라온다.
- 입력: 마우스 휠(커서 기준 줌) / 드래그 팬 / 터치 핀치·드래그 / 더블클릭(또는 ⟲ 버튼) 리셋. 줌 ± 오버레이 버튼(#stage 우상단, 모바일 폴백).
- 카메라 클램프: 보드 bbox 밖으로 못 나가게.
- 옵션: 이동 후 플레이어 토큰 자동 추적(부드러운 카메라).

**config/ui 키 (행 추가):**

| 키 | 타입 | 기본 | 의미 |
| --- | --- | --- | --- |
| `board_zoom` | bool | 1 | 줌 기능 on/off |
| `board_zoom_min` / `board_zoom_max` | float | 0.5 / 3 | 배율 한계 |
| `board_zoom_default` | float | 1 | 시작 배율(1=자동 맞춤) |
| `board_zoom_step` | float | 0.15 | 휠/버튼 1회 증분 |
| `board_pan` | bool | 1 | 드래그 이동 on/off |
| `board_zoom_buttons` | bool | 1 | ± 버튼 표시 |
| `board_follow_player` | bool | 0 | 이동 시 카메라가 토큰 추적 |
| `board_fit_padding` | px | 24 | 자동 맞춤 여백 |
| `board_cell_min` / `board_cell_max` | px | 24 / 96 | 자동 맞춤 셀 크기 클램프(현재 하드코딩 값의 노출) |

**리스크:**
- 이동 애니메이션(`stepTo`) 중 줌하면 보간 좌표가 틀어짐 → 보간을 화면 좌표가 아닌 **타일 좌표**로 저장하고 매 프레임 `tileCenter()` 재계산으로 변경.
- 줌 상태는 세이브에 넣지 않음(테이블·세이브 구조 불변) — localStorage(`db_ui_state`)에만 기억.

### M3 — 포트레이트·캐릭터 패널 자유 조절

**목표:** 기존 `portrait_size`/`portrait_fit`/`char_body_width`(이미 config 지원)를 패널 전체의 자유 배치로 확장.

**키 (전부 CSS 변수로 직결, index.html에 변수 참조만 추가):**

| 키 | 기본 | 의미 |
| --- | --- | --- |
| `portrait_size` (기존) | 52px | 포트레이트 한 변 |
| `portrait_fit` (기존) | cover | cover/contain/fill |
| `portrait_radius` | 10px | 모서리(`50%`=원형) |
| `portrait_border` | (없음) | 테두리 색 |
| `char_panel_pos` | tl | tl/tr/bl/br — 패널 모서리 |
| `char_panel_x` / `char_panel_y` | 12px | 모서리로부터 오프셋 |
| `char_panel_opacity` | 0.82 | 배경 불투명도 |
| `char_panel_scale` | 1 | 패널 전체 배율 |
| `char_name_size` | 14px | 이름 폰트 |
| `char_panel_max_width` | min(80vw,520px) | 최대 폭 |

### M4 — UI 전체 자유 조절 + 표시 토글

**목표:** "테이블에서 UI의 온갖 기능을 제어"의 본체.

- **전역 배율 `ui_scale`:** 캔버스를 제외한 UI 레이어(#game-header, #char-panel, #event-log, #game-footer, 팝업/VN)에 적용. 구현은 CSS `zoom` 속성(현행 브라우저 전부 지원, 레이아웃에 실제 반영) 우선, 필요 시 폰트 기반 보조. 보드 캔버스는 M2 줌이 담당하므로 제외.
- **영역별 배율:** `hud_scale`, `log_scale`, `popup_scale`, `vn_scale`, `footer_scale`.
- **표시 토글/배치:**
  - `show_progress`, `show_log`, `show_dice_result`, `show_header`, `show_status`(푸터 위치줄)
  - `log_pos`(br/bl/tr/tl), `log_width`, `log_max_lines`(현재 10 하드코딩), `log_font_size`
  - `progress_height`, `progress_colors`
- **수치 노출:** `anim_step_ms`(현재 220 하드코딩), `enemy_step_ms`(120), `anim_speed`(전체 배속)
- **팝업/VN:** `popup_width`, `popup_radius`, `vn_frame_width`(92%), `vn_frame_height`(88%), `vn_side_width`(28%), `vn_text_size`, `vn_dim`(배경 어둡기 0.72)
- **오디오:** `bgm_volume`, `sfx_volume` (AudioManager에 전달)

### M5 — 도구·검증·문서 마무리

- `tools/schema-meta.mjs`: `INFO.config`/`INFO.ui` rows에 신규 키 설명 추가(엑셀 시트 도움말에 자동 반영). **cols는 손대지 않음.**
- `tools/validate.mjs`:
  - 알려진 UI 키 목록(UiSettings 선언에서 추출한 JSON 또는 수동 목록)과 대조해 **오타 의심 키를 warn**.
  - 숫자 키(`*_size`, `*_scale`, `board_zoom_*` 등) 값 타입 검사.
- README/AUTHORING/TOOLING에 키 레퍼런스 표 추가. 신규 사용자 노출 문구는 `tu()` 경유 + `data:strings` 재추출.
- 데모: `stage01/config.csv`와 `ui.csv`에 예시 키 몇 줄 추가해 눈으로 확인 가능하게.

**적용 순서 제안:** M1 → M2 → M3 → M4 → M5. (M3/M4는 M1 위에서 병행 가능. M2는 독립성이 높아 먼저 빼도 됨.)

---

## 3. 추가 기능 아이디어 (제안 — 채택 여부 결정 대기)

전부 "행 추가"만으로 표현 가능한 것만 골랐다.

| 아이디어 | 키 예시 | 메모 |
| --- | --- | --- |
| **미니맵** | `minimap`, `minimap_size`, `minimap_pos` | 줌인 상태에서 전체 보드 축소판 + 현재 카메라 영역 표시. M2와 시너지 |
| **타일 라벨 표시 모드** | `tile_label_mode` = full/short/none, `tile_type_label` = 1/0 | 현재 모든 칸에 ID/타입 텍스트가 떠서 그림 타일과 충돌. 스프라이트 중심 보드에 유용 |
| **테마 프리셋** | `theme_preset` = dark/light/parchment… | 색 토큰 묶음을 코드에 프리셋으로 두고 키 하나로 선택, 개별 키로 미세 조정 |
| **접근성** | `reduce_motion`, `font_scale`, `colorblind_palette` | reduce_motion=1이면 anim_speed 무시하고 즉시 이동 |
| **데미지 연출** | `fx_shake`, `fx_flash` | 피해 시 화면 흔들림/적색 플래시. 보드 캔버스 + UI 레이어 |
| **주사위 연출** | `dice_anim` = none/spin/3d, `dice_anim_ms` | 현재는 결과 텍스트만 표시 |
| **이벤트 로그 히스토리** | `log_history`(클릭 시 전체 로그 팝업), `log_fade_ms` | 현재 10줄 후 소실 |
| **키보드 단축키** | `hotkey_roll` = space 등 | 굴리기/음소거/줌 리셋 |
| **HUD 게이지 색 제어** | `hud_bar_color.<stat_id>` | 현재 barColor()가 id 휴리스틱 — 테이블로 명시 가능하게 |
| **상태/인벤 칩 스타일** | `chip_size`, `chip_font_size` | 칩 가독성 조절 |
| **VN 타자기 효과** | `vn_text_speed` (0=즉시) | 글자 점진 출력 |
| **커서/포인터 스킨** | `cssvar.--cursor` + CSS | 범용 통로만으로 가능 — 별도 코드 불필요한 예시 |
| **런타임 설정 패널** | `settings_button` = 1 | ⚙ 버튼 → 줌·UI 배율·볼륨 슬라이더. 기본값은 테이블, 사용자가 바꾼 값은 localStorage(테이블·세이브 불변) |

---

## 4. 변경 파일 예상 (코드만, 데이터 구조 불변)

| 파일 | 변경 |
| --- | --- |
| `src/ui/UiSettings.ts` | **신설** — 키 선언/병합/주입 |
| `src/core/theme.ts` | UiSettings 위임(키 목록 이관) |
| `src/render/CanvasRenderer.ts` | 카메라(zoom/pan), 클램프 키 수용 |
| `src/scenes/GameScene.ts` | 입력 핸들러(휠/드래그/핀치), applyImageSpecs → UiSettings, 토글/배속 반영 |
| `index.html` | 신규 CSS 변수 참조(기본값은 현행 그대로) |
| `src/ui/Hud.ts`, `Popup.ts`, `VNOverlay.ts` | 변수화된 수치 사용(소폭) |
| `src/core/AudioManager.ts` | 볼륨 키 |
| `tools/validate.mjs`, `tools/schema-meta.mjs` | 키 경고·INFO 설명 (cols 불변) |
| `docs/*`, `README.md` | 키 레퍼런스 |
| `public/resources/data/ui.csv`, `data/stage01/config.csv` | 예시 행 추가 (구조 불변) |

## 5. 호환성 체크리스트 (각 마일스톤 완료 조건)

- [ ] 키를 하나도 추가하지 않은 기존 데이터로 실행 시, 픽셀 단위 동일 동작
- [ ] `npm run data:validate` 통과 (기존 + 예시 키)
- [ ] `npm run data:import` / `export` 라운드트립에서 신규 행 보존
- [ ] 세이브 파일 포맷 불변 (줌/배율 상태는 localStorage)
- [ ] `npm run build` (tsc) 통과
