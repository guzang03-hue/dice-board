// 테이블 스키마 메타데이터.
// 각 테이블의 컬럼을 {key=변수명, ko=한글 표시명, type=타입}으로 정의한다.
// csv-sync.mjs가 이걸로 3행 헤더(한글/변수/타입)를 만든다.
// 사람용 설명은 아래 INFO에 따로 두고, csv-sync가 그걸 모아 "_안내" 시트 하나로 그린다.
//
// key 순서는 실제 CSV 컬럼 순서와 같아야 한다(게임 파서가 변수명 행으로 매칭하므로
// 순서 자체는 무관하지만, 마이그레이션 시 기존 헤더와 정렬을 맞추기 위함).

/** @typedef {{key:string, ko:string, type:string}} Col */
/** @typedef {{cols: Col[]}} TableMeta */

/** @type {Record<string, TableMeta>} */
export const SCHEMA = {
  config: {
    cols: [
      { key: "key", ko: "설정 키", type: "string" },
      { key: "value", ko: "값", type: "string" },
    ],
  },
  ui: {
    cols: [
      { key: "key", ko: "UI 설정 키", type: "string" },
      { key: "value", ko: "값", type: "string" },
    ],
  },
  stats: {
    cols: [
      { key: "id", ko: "스탯 ID", type: "string" },
      { key: "label", ko: "표시 이름", type: "string" },
      { key: "icon", ko: "아이콘", type: "string" },
      { key: "kind", ko: "종류(number/bool/status)", type: "string" },
      { key: "min", ko: "최소값", type: "int" },
      { key: "max", ko: "최대값", type: "int" },
      { key: "start", ko: "시작값", type: "int" },
      { key: "decay", ko: "턴당 증감", type: "int" },
      { key: "visible", ko: "표시 여부", type: "bool" },
      { key: "display", ko: "표현(bar/counter/flag/hidden)", type: "string" },
      { key: "duration", ko: "지속 턴(status)", type: "int" },
      { key: "max_stacks", ko: "중첩 한도(status)", type: "int" },
      { key: "per_turn_target", ko: "매 턴 대상 ← stats.id(status)", type: "string" },
      { key: "per_turn_amount", ko: "매 턴 증감(status)", type: "int" },
    ],
  },
  tiles: {
    cols: [
      { key: "id", ko: "칸 ID", type: "string" },
      { key: "x", ko: "X 좌표", type: "int" },
      { key: "y", ko: "Y 좌표", type: "int" },
      { key: "type", ko: "칸 타입(빈=region 랜덤)", type: "string" },
      { key: "sprite", ko: "스프라이트 ← assets.id", type: "string" },
      { key: "event_id", ko: "고정 이벤트 ← events.id", type: "string" },
      { key: "region", ko: "지역(→generation.region)", type: "string" },
      { key: "locked", ko: "고정 여부(1=보존)", type: "bool" },
      { key: "label", ko: "칸 라벨", type: "string" },
      { key: "stop", ko: "스킵 불가(1=강제 정지)", type: "bool" },
    ],
  },
  edges: {
    cols: [
      { key: "id", ko: "엣지 ID", type: "string" },
      { key: "from", ko: "출발 칸 ← tiles.id", type: "string" },
      { key: "to", ko: "도착 칸 ← tiles.id", type: "string" },
      { key: "label", ko: "선택지 문구(빈=주경로)", type: "string" },
      { key: "cond_group", ko: "통행 조건 ← conditions.group_id", type: "string" },
    ],
  },
  events: {
    cols: [
      { key: "id", ko: "이벤트 ID", type: "string" },
      { key: "type", ko: "이벤트 타입", type: "string" },
      { key: "cond_group", ko: "발동 조건 ← conditions.group_id", type: "string" },
      { key: "probability", ko: "발동 확률", type: "float" },
      { key: "payload", ko: "효과 ← effects.group_id", type: "string" },
      { key: "title", ko: "제목", type: "string" },
      { key: "text", ko: "본문", type: "string" },
      { key: "icon", ko: "아이콘(이모지)", type: "string" },
      { key: "image", ko: "이미지 경로", type: "string" },
      { key: "background", ko: "VN 배경 ← assets.id/색", type: "string" },
      { key: "speaker", ko: "VN 화자명", type: "string" },
      { key: "sprite1", ko: "VN 캐릭터1 ← assets.id(sprite)", type: "string" },
      { key: "sprite2", ko: "VN 캐릭터2 ← assets.id(sprite)", type: "string" },
      { key: "sprite3", ko: "VN 캐릭터3 ← assets.id(sprite)", type: "string" },
    ],
  },
  choices: {
    cols: [
      { key: "id", ko: "선택지 행 ID", type: "string" },
      { key: "event_id", ko: "이벤트 ID", type: "string" },
      { key: "choice_id", ko: "선택지 ID", type: "string" },
      { key: "text", ko: "선택지 문구", type: "string" },
      { key: "cond_group", ko: "활성 조건 ← conditions.group_id", type: "string" },
      { key: "result_effect_id", ko: "결과 효과 ← effects.group_id", type: "string" },
      { key: "next_event", ko: "다음 이벤트 ← events.id", type: "string" },
    ],
  },
  effects: {
    cols: [
      { key: "id", ko: "효과 ID(고유)", type: "string" },
      { key: "group_id", ko: "그룹 ← payload/result_effect_id", type: "string" },
      { key: "seq", ko: "순서", type: "int" },
      { key: "kind", ko: "효과 종류", type: "string" },
      { key: "target", ko: "대상 ← stats.id/타일", type: "string" },
      { key: "value", ko: "값", type: "string" },
    ],
  },
  generation: {
    cols: [
      { key: "id", ko: "생성규칙 ID", type: "string" },
      { key: "region", ko: "지역", type: "string" },
      { key: "tile_type", ko: "칸 타입 → tiles.type", type: "string" },
      { key: "weight", ko: "가중치", type: "int" },
    ],
  },
  tile_events: {
    cols: [
      { key: "id", ko: "타일이벤트 ID", type: "string" },
      { key: "tile_type", ko: "칸 타입 → tiles.type", type: "string" },
      { key: "event_id", ko: "도착 이벤트 ← events.id", type: "string" },
      { key: "weight", ko: "가중치", type: "int" },
      { key: "cond_group", ko: "조건 ← conditions.group_id", type: "string" },
    ],
  },
  conditions: {
    cols: [
      { key: "id", ko: "조건 ID(고유)", type: "string" },
      { key: "group_id", ko: "그룹 ← cond_group", type: "string" },
      { key: "subject", ko: "대상 ← stats.id/flag", type: "string" },
      { key: "op", ko: "비교", type: "string" },
      { key: "value", ko: "값", type: "string" },
    ],
  },
  assets: {
    cols: [
      { key: "id", ko: "자산 ID", type: "string" },
      { key: "kind", ko: "종류(image/audio/sprite)", type: "string" },
      { key: "path", ko: "경로", type: "string" },
      { key: "speaker", ko: "화자명(sprite)", type: "string" },
      { key: "expr", ko: "표정 태그(sprite)", type: "string" },
      { key: "pos", ko: "위치(left/center/right, sprite)", type: "string" },
    ],
  },
  stages: {
    cols: [
      { key: "id", ko: "스테이지 ID", type: "string" },
      { key: "name", ko: "이름", type: "string" },
      { key: "description", ko: "설명", type: "string" },
      { key: "config_path", ko: "데이터 폴더", type: "string" },
      { key: "unlock_cost", ko: "해금 비용", type: "int" },
      { key: "icon", ko: "아이콘", type: "string" },
    ],
  },
  endings: {
    cols: [
      { key: "id", ko: "엔딩 ID", type: "string" },
      { key: "when", ko: "상황", type: "string" },
      { key: "cond_group", ko: "조건 ← conditions.group_id", type: "string" },
      { key: "priority", ko: "우선도", type: "int" },
      { key: "title", ko: "제목", type: "string" },
      { key: "text", ko: "본문", type: "string" },
      { key: "icon", ko: "아이콘", type: "string" },
      { key: "image", ko: "이미지 경로", type: "string" },
    ],
  },
  characters: {
    cols: [
      { key: "id", ko: "캐릭터 ID", type: "string" },
      { key: "name", ko: "이름", type: "string" },
      { key: "portrait", ko: "포트레이트(이모지/경로)", type: "string" },
      { key: "desc", ko: "설명", type: "string" },
      { key: "start_effect_group", ko: "시작 효과 ← effects.group_id", type: "string" },
      { key: "icon", ko: "아이콘", type: "string" },
    ],
  },
  derived: {
    cols: [
      { key: "id", ko: "파생 ID", type: "string" },
      { key: "target", ko: "대상 자원 ← stats.id", type: "string" },
      { key: "term", ko: "입력 자원 ← stats.id(빈=상수)", type: "string" },
      { key: "factor", ko: "가중치", type: "float" },
    ],
  },
  thresholds: {
    cols: [
      { key: "id", ko: "임계 ID", type: "string" },
      { key: "subject", ko: "대상 ← stats.id/flag/status", type: "string" },
      { key: "op", ko: "비교", type: "string" },
      { key: "value", ko: "값", type: "string" },
      { key: "event", ko: "발동 이벤트 ← events.id", type: "string" },
      { key: "effect", ko: "또는 효과 ← effects.group_id", type: "string" },
      { key: "mode", ko: "once/repeat", type: "string" },
    ],
  },
  enemies: {
    cols: [
      { key: "id", ko: "적 ID", type: "string" },
      { key: "label", ko: "이름", type: "string" },
      { key: "icon", ko: "아이콘", type: "string" },
      { key: "start", ko: "시작 칸 ← tiles.id", type: "string" },
      { key: "behavior", ko: "행동", type: "string" },
      { key: "speed", ko: "속도(턴당 행동)", type: "int" },
      { key: "damage", ko: "피해", type: "int" },
      { key: "event", ko: "접촉 이벤트 ← events.id", type: "string" },
      { key: "vision", ko: "시야(BFS 거리)", type: "int" },
      { key: "contact", ko: "접촉(move/pass/both)", type: "string" },
      { key: "sprite", ko: "스프라이트 ← assets.id", type: "string" },
      { key: "cond_group", ko: "활성 조건 ← conditions.group_id", type: "string" },
    ],
  },
  items: {
    cols: [
      { key: "id", ko: "아이템 ID", type: "string" },
      { key: "name", ko: "이름", type: "string" },
      { key: "icon", ko: "아이콘", type: "string" },
      { key: "desc", ko: "설명", type: "string" },
      { key: "use_effect_group", ko: "사용 효과 ← effects.group_id", type: "string" },
      { key: "consumable", ko: "소모성(1/0)", type: "bool" },
      { key: "max_stack", ko: "최대 보유(0=무제한)", type: "int" },
      { key: "cond_group", ko: "사용 조건 ← conditions.group_id", type: "string" },
    ],
  },
  meta: {
    cols: [
      { key: "id", ko: "업그레이드 ID", type: "string" },
      { key: "label", ko: "이름", type: "string" },
      { key: "description", ko: "설명", type: "string" },
      { key: "cost", ko: "비용", type: "int" },
      { key: "effect_kind", ko: "효과 종류", type: "string" },
      { key: "target", ko: "대상 자원", type: "string" },
      { key: "value", ko: "랭크당 효과", type: "int" },
      { key: "max_rank", ko: "최대 랭크", type: "int" },
    ],
  },
};

// 파일명(events.csv) → 테이블 base 이름(events)
export function tableOf(fileName) {
  return fileName.replace(/\.csv$/i, "");
}

// ───────── 사람용 설명 (csv-sync가 "_안내" 시트 하나로 모아 그린다) ─────────
// 표 하나당 { overview: 서술형 개요, rows: [{name, desc}] }.
// name은 보통 컬럼 이름이지만, 메모나 값 설명을 끼울 수도 있다.
// 말투는 단문 서술형 — 키워드 나열이 아니라 읽으면 문장이 되도록 적는다.

// 안내 시트 맨 위에 두는 머리말.
export const GUIDE_INTRO = [
  "이 워크북은 게임 데이터를 편하게 손보라고 만든 사본이에요. 게임이 실제로 읽는 건 언제나 CSV입니다. 엑셀에서 더한 드롭다운이나 색, 이 안내 시트는 내보낼 때 빠져요.",
  "표마다 머리글이 세 줄이에요. 첫 줄은 한글 이름, 둘째 줄은 게임이 읽는 변수명, 셋째 줄은 타입이고, 그 아래부터가 실제 데이터입니다.",
  "id 옆에 화살표로 뜨는 이름이나 빨갛게 물든 칸은 길잡이일 뿐이에요. 데이터가 맞는지 최종으로 판정하는 건 검사(validate)입니다.",
  "아래는 표 하나하나가 무슨 일을 하고, 각 칸에 무엇을 적는지 적어 둔 설명서예요.",
];

/** @type {Record<string, {overview: string, rows: {name: string, desc: string}[]}>} */
export const INFO = {
  config: {
    overview:
      "스테이지 하나의 전역 설정이에요. 다른 표는 한 줄이 한 항목이지만, 여기서는 왼쪽 칸에 설정 이름을, 오른쪽 칸에 값을 적습니다. 필요한 설정만 골라 적으면 되고, 적지 않은 건 기본값으로 동작해요.",
    rows: [
      { name: "start_tile", desc: "토큰이 처음 올라갈 칸이에요. 이것만은 꼭 적어야 합니다. tiles 표의 id를 그대로 쓰세요." },
      { name: "goal_tile", desc: "닿으면 승리로 끝나는 칸이에요. 비워 두면 목표 칸 없이 다른 조건으로만 끝납니다." },
      { name: "seed", desc: "보드를 섞는 난수의 씨앗이에요. 비워 두면 켤 때마다 새 보드가 나오고, 값을 적으면 늘 같은 보드가 나옵니다. 숫자든 글자든 다 괜찮아요." },
      { name: "board_name", desc: "화면에 보여 줄 보드 이름이에요." },
      { name: "generator", desc: "빈 칸을 채우는 방식이에요. 보통은 비워 두면 가중치 방식으로 알아서 채웁니다." },
      { name: "dice", desc: "주사위 표기예요. 2d6은 6면체 둘을 굴려 더하고, d20은 20면체 하나, d6+1은 굴린 값에 1을 더해요. 이 값이 있으면 dice_sides보다 먼저 쓰입니다." },
      { name: "dice_sides", desc: "주사위 한 개의 면 수예요. dice 표기를 안 썼을 때만 쓰이고, 비우면 6면체로 봅니다." },
      { name: "player_name", desc: "캐릭터 패널에 띄울 이름이에요. 캐릭터를 고르는 스테이지라면 고른 캐릭터 이름이 이걸 덮어씁니다." },
      { name: "portrait", desc: "캐릭터 초상이에요. 이모지를 그대로 적어도 되고, 이미지 경로를 적어도 돼요. 경로가 /로 시작하면 public 폴더 기준입니다." },
      { name: "lose_cond_group", desc: "패배를 판정할 조건 묶음이에요. 비워 두면 HP가 0 이하가 될 때 지는 걸로 봅니다. conditions 표의 group 이름을 적으세요." },
      { name: "on_turn_start", desc: "매 턴이 시작될 때 실행할 효과 묶음이에요. 상태 이상 처리가 끝난 뒤에 돌아갑니다. effects 표의 group 이름을 적으세요." },
      { name: "on_turn_end", desc: "매 턴이 끝날 때 실행할 효과 묶음이에요." },
      { name: "player_sprite", desc: "보드 위 플레이어 말(토큰)에 띄울 이미지예요. assets의 id나 경로를 적어요. 비우면 색 원(player_color)으로 그립니다. (적 말은 enemies 표의 sprite로 지정)" },
      { name: "(보드 외형)", desc: "아래 키로 보드 색·테두리·말 모양을 바꿀 수 있어요(모두 선택, 비우면 기본값). 색은 #hex." },
      { name: "· board_bg", desc: "캔버스 배경색." },
      { name: "· edge_color · edge_width", desc: "칸을 잇는 선의 색과 굵기(px)." },
      { name: "· tile_pad · tile_radius", desc: "칸 안쪽 여백(px)과 모서리 둥글기(px)." },
      { name: "· tile_border · tile_border_width", desc: "칸 테두리 색과 굵기(px). tile_border가 비면 테두리를 안 그려요." },
      { name: "· locked_border", desc: "locked 칸을 강조하는 테두리 색." },
      { name: "· player_color · enemy_color", desc: "말 이미지가 없을 때 쓰는 플레이어/적 토큰 색." },
      { name: "· token_stroke · token_radius", desc: "말 외곽선 색과, 칸 크기 대비 말 반지름 비율(0~0.5, 기본 0.18)." },
      { name: "(적 설정)", desc: "적은 더 이상 여기 적지 않아요. enemies 표로 옮겨졌습니다." },
      { name: "(UI 확장 키)", desc: "아래 키들은 화면 UI를 표에서 제어해요(모두 선택). 전역 ui.csv에 적으면 모든 스테이지에, 여기 적으면 이 스테이지에만 적용됩니다. 전체 목록과 기본값은 docs/UI-KEYS.md 참고." },
      { name: "· board_zoom 계열", desc: "보드 확대·축소·끌기예요. board_zoom(1/0) · board_zoom_min/max(배율 한계) · board_zoom_default(시작 배율) · board_zoom_step(휠 한 칸) · board_pan(끌기) · board_zoom_buttons(± 버튼) · board_follow_player(확대 중 토큰 따라가기) · board_fit_padding · board_cell_min/max(자동 맞춤 칸 크기 한계 px)." },
      { name: "· portrait/char_panel 계열", desc: "초상과 캐릭터 패널이에요. portrait_size(px) · portrait_fit(cover/contain/fill) · portrait_radius(50%=원형) · portrait_border(색) · char_body_width(px) · char_panel_pos(tl/tr/bl/br) · char_panel_x/y(모서리 여백 px) · char_panel_opacity(0~1) · char_panel_scale · char_name_size(px) · char_panel_max_width." },
      { name: "· 배율 계열", desc: "ui_scale은 보드를 뺀 UI 전체 배율, hud_scale·log_scale·popup_scale·vn_scale·footer_scale은 영역별 추가 배율이에요(곱해짐)." },
      { name: "· 표시/배치 계열", desc: "show_header·show_progress·show_log·show_dice_result·show_status(1/0 토글), log_pos(br/bl/tr/tl)·log_width(px)·log_max_lines·log_font_size(px)·progress_height(px)." },
      { name: "· 애니메이션", desc: "anim_step_ms(토큰 한 칸 이동 ms, 기본 220) · enemy_step_ms(적 한 칸 ms, 기본 120) · anim_speed(전체 배속, 2=두 배 빠르게)." },
      { name: "· 팝업/VN/아트", desc: "popup_min_width·popup_max_width·popup_radius(px), popup_art_height·popup_art_fit, result_art_size·result_art_fit, vn_frame_width/height(%)·vn_side_width·vn_text_size(px)·vn_dim(0~1 배경 어둡기)." },
      { name: "· 오디오", desc: "bgm_volume·sfx_volume(0~1)." },
      { name: "· cssvar.<이름>", desc: "임의 CSS 변수를 그대로 주입하는 범용 통로예요. 예: cssvar.--cursor 행은 --cursor 변수가 됩니다. 코드 수정 없이 새 외형 변수를 만들 때 써요." },
      { name: "· 칩/라벨/연출", desc: "status_chip_size·inv_chip_size(칩 글자 px), tile_label_mode(full/short/none)·tile_type_label(1/0), dice_anim(none/spin)·dice_anim_ms, vn_text_speed(글자당 ms, 0=즉시), log_history(1=로그 클릭 시 전체 보기)." },
      { name: "· hud_bar_color.<stat_id>", desc: "해당 스탯의 HUD 게이지 색이에요(#hex). 안 적으면 id 휴리스틱(hp=빨강, gold=노랑…)." },
      { name: "· hotkey_*", desc: "키보드 단축키예요. hotkey_roll(기본 space)·hotkey_mute(m)·hotkey_zoom_in(=)·hotkey_zoom_out(-)·hotkey_zoom_reset(0). 값은 KeyboardEvent.key 소문자, 빈 값=비활성." },
      { name: "(텍스트 치환)", desc: "events/choices의 title·text와 MSG 효과 텍스트 안에서 {hp}처럼 적으면 표시 시점의 값으로 바뀌어요. {hp.max}·{flag.이름}·{status.id}(남은 턴)·{item.id}(개수)도 됩니다. 모르는 토큰은 그대로 보여요(오타 확인용)." },
    ],
  },
  ui: {
    overview:
      "게임 전체의 외형(테마)과 시작화면 문구를 데이터로 바꾸는 전역 표예요. config처럼 왼쪽에 키, 오른쪽에 값을 적습니다. data/ 루트에 한 벌만 두고, 없으면 코드 기본값으로 동작해요. 색·배경·폰트는 CSS 변수로 적용되고, app_name/app_tagline은 시작화면 텍스트(번역 대상)예요.",
    rows: [
      { name: "app_name · app_tagline", desc: "시작화면 제목과 한 줄 소개예요. tu()를 거치므로 번역 대상(UI_app_name 등)이 됩니다." },
      { name: "accent · accent_dim · bg · card · border · text · muted", desc: "색 토큰이에요. index.html :root와 같은 이름이라 적으면 전역에 덮어써집니다(#hex)." },
      { name: "menu_bg · ui_radius · font_family", desc: "시작화면 배경(색/그라데이션) · 모서리 반경 · 글꼴이에요." },
      { name: "menu_bg_image · stage_bg_image · result_bg_image · meta_bg_image · btn_image", desc: "화면별 배경 이미지·버튼 스킨이에요. 경로만 적으면 url()로 감싸 깔립니다(빈=없음)." },
      { name: "lang", desc: "기본 언어 코드예요. 비우거나 ko면 인라인 한국어 그대로, 그 외(en 등)면 부팅 때 strings_<lang>.json을 올려 번역으로 덮어씁니다." },
      { name: "(UI 확장 키)", desc: "config의 UI 확장 키(board_zoom·portrait_size·ui_scale·show_* 등)를 여기 적으면 모든 스테이지의 기본값이 돼요. 스테이지 config에 같은 키가 있으면 그쪽이 이깁니다. 전체 목록은 docs/UI-KEYS.md 참고." },
      { name: "cssvar.<이름>", desc: "임의 CSS 변수를 전역으로 주입하는 범용 통로예요(인게임 화면에 적용)." },
    ],
  },
  stats: {
    overview:
      "플레이어가 들고 다니는 자원·능력치·지속 상태를 한 표에 모은 전역(런) 표예요. data/ 루트에 한 벌만 두고 모든 스테이지가 공유합니다(스테이지를 넘어 살아남는 값이라 전역). kind로 자원(number/bool)과 상태(status)를 가릅니다. 줄을 더하면 스탯이 늘어나요.",
    rows: [
      { name: "id", desc: "스탯을 가리키는 고유 이름이에요. 효과·조건·파생에서 이 id로 지목합니다. 영문 소문자로 짧게 적는 걸 권해요." },
      { name: "label", desc: "화면에 보여 줄 한글 이름이에요." },
      { name: "icon", desc: "옆에 띄울 아이콘이에요. 이모지를 직접 적어도 되고, heart·coin·torch 같은 키워드를 적으면 HUD에서 알맞은 이모지로 바꿔 줍니다." },
      { name: "kind", desc: "number는 보통의 수치 자원, bool은 가졌다·안 가졌다만 따지는 자원, status는 한동안 따라다니는 지속 상태(독·실드·재생 등)예요. status 줄은 아래 duration~per_turn 칸을 씁니다." },
      { name: "min · max", desc: "(자원) 값이 움직일 수 있는 아래위 한계예요. 둘 다 비우면 한계가 없습니다." },
      { name: "start", desc: "(자원) 게임을 시작할 때의 값이에요." },
      { name: "decay", desc: "(자원) 턴이 시작될 때마다 저절로 더해지는 양이에요. 음수면 매 턴 줄어듭니다." },
      { name: "visible", desc: "(자원) 1이면 HUD에 보이고, 0이면 속으로만 추적하고 감춰요. 비우면 보이는 게 기본입니다." },
      { name: "display", desc: "(자원) bar는 게이지, counter는 숫자만, flag는 보유 체크, hidden은 숨김. 비우면 성격에 맞춰 자동으로 골라요." },
      { name: "duration", desc: "(status) 기본으로 몇 턴 갈지예요. APPLY_STATUS의 value로 이 값을 덮어쓸 수 있어요." },
      { name: "max_stacks", desc: "(status) 몇 겹까지 쌓을 수 있는지예요. 비우면 한 겹입니다." },
      { name: "per_turn_target · per_turn_amount", desc: "(status) 매 턴 시작마다 어떤 스탯을 얼마만큼 증감할지예요. 독은 hp에 -1, 재생은 hp에 +1 식으로 적습니다. 중첩된 만큼 곱해 적용돼요. 효과(effects)를 가리키지 않고 표 안에서 자족합니다." },
    ],
  },
  tiles: {
    overview:
      "보드를 이루는 칸이에요. 좌표를 주면 그 자리에 칸이 놓이고, 칸들을 edges로 이으면 길이 됩니다. 타입이나 이벤트를 비워 두면 생성기가 알아서 채워 주니, 모든 칸을 손으로 정할 필요는 없어요.",
    rows: [
      { name: "id", desc: "칸을 가리키는 고유 이름이에요. edges나 효과의 이동에서 이 id로 칸을 지목합니다." },
      { name: "x · y", desc: "칸이 놓일 좌표예요. 격자 위의 위치라고 보면 됩니다." },
      { name: "type", desc: "칸의 종류예요. 비워 두면 그 칸의 region에 맞춰 생성기가 뽑아 채웁니다. start·goal·boon·trap·hazard·event·shortcut·setback·shop·shrine·empty 중에서 써요." },
      { name: "sprite", desc: "칸에 깔 그림이에요. assets 표의 id를 적으면 되고, 비우면 색으로만 표시됩니다." },
      { name: "event_id", desc: "그 칸에 도착했을 때 꼭 터질 이벤트예요. 적어 두면 그게 가장 먼저 실행되고, 비우면 칸 타입에 맞는 이벤트 풀에서 뽑습니다. events 표의 id를 쓰세요." },
      { name: "region", desc: "칸이 속한 지역이에요. 생성기가 지역별 가중치로 빈 칸을 채울 때 씁니다." },
      { name: "locked", desc: "1이면 생성기가 이 칸을 건드리지 않고 그대로 둬요. 미리 손으로 배치해 둔 칸에 씁니다." },
      { name: "label", desc: "칸에 붙일 이름표예요." },
      { name: "stop", desc: "1이면 지나가다 이 칸에 닿는 순간 멈춰 서요. 남은 주사위 이동을 취소합니다. 상점처럼 그냥 지나치면 안 되는 칸에 써요." },
    ],
  },
  edges: {
    overview:
      "칸과 칸을 잇는 길이에요. 방향이 있어서 from에서 to로 흐릅니다. 한 칸에서 나가는 길이 둘 이상이면, 그 자리에서 어느 길로 갈지 고르는 갈림길이 돼요.",
    rows: [
      { name: "from · to", desc: "길의 출발 칸과 도착 칸이에요. 둘 다 tiles 표의 id로 적습니다. 좌표와 상관없이 자유롭게 이을 수 있어요." },
      { name: "label", desc: "비워 두면 평범한 주 경로예요. 글을 적으면 갈림길이 생겼을 때 그 글이 선택 버튼의 문구가 됩니다." },
      { name: "cond_group", desc: "이 길을 지나려면 만족해야 할 조건 묶음이에요. 비우면 언제나 열려 있고, 적어 두면 조건을 채웠을 때만 갈 수 있습니다. 주 경로에는 비워 두세요. conditions 표의 group 이름을 씁니다." },
    ],
  },
  events: {
    overview:
      "칸에 도착했을 때 벌어지는 일이에요. 함정을 밟거나, 상인을 만나거나, 갈림길에서 무언가를 고르는 장면이 모두 이 표에서 나옵니다.",
    rows: [
      { name: "id", desc: "이벤트를 가리키는 고유 이름이에요. 칸이나 다른 이벤트가 이 id로 불러옵니다." },
      { name: "type", desc: "이벤트의 성격이에요. EFFECT는 곧장 효과를 주고, CHOICE는 선택지를 띄우고, MOVE는 칸을 옮기고, NONE은 아무 일도 안 해요." },
      { name: "cond_group", desc: "이 이벤트가 발동할 조건이에요. 비우면 늘 발동하고, 적으면 조건을 채웠을 때만 발동합니다." },
      { name: "probability", desc: "발동할 확률이에요. 0과 1 사이로 적고, 비우면 1이라 항상 발동합니다." },
      { name: "payload", desc: "EFFECT일 때 실행할 효과 묶음이에요. effects 표의 group 이름을 적습니다. MOVE라면 move:3처럼 몇 칸 옮길지를 적어요." },
      { name: "title", desc: "팝업 맨 위에 보여 줄 제목이에요." },
      { name: "text", desc: "팝업 본문 글이에요." },
      { name: "icon", desc: "이미지가 없거나 불러오지 못했을 때 팝업에 대신 띄울 이모지예요." },
      { name: "image", desc: "팝업에 띄울 그림 경로예요. /로 시작하면 public 폴더 기준이고, 아니면 그 스테이지 폴더를 기준으로 찾습니다." },
      { name: "background · speaker · sprite1/2/3", desc: "(VN 렌더) 셋 중 하나라도 채우면 그 이벤트는 비주얼 노벨 화면으로 떠요. background는 배경(assets.id 또는 색), speaker는 대사 창 화자명, sprite1~3은 등장 캐릭터(assets.id, kind=sprite). 비우면 평소 팝업으로 동작합니다. 선택지·본문·체인(next_event)은 그대로 재사용돼요." },
    ],
  },
  choices: {
    overview:
      "CHOICE 이벤트가 띄우는 선택지예요. 한 줄이 버튼 하나고, 같은 이벤트에 묶인 줄들이 한 화면에 함께 떠요. 고르면 효과가 실행되고, 원하면 다른 이벤트로 이어집니다.",
    rows: [
      { name: "event_id", desc: "이 선택지가 속한 이벤트예요. events 표의 id를 적습니다." },
      { name: "choice_id", desc: "이벤트 안에서 이 선택지를 구분하는 이름이에요." },
      { name: "text", desc: "버튼에 적힐 글이에요." },
      { name: "cond_group", desc: "이 버튼이 눌리려면 채워야 할 조건이에요. 못 채우면 버튼이 흐려져 누를 수 없습니다." },
      { name: "result_effect_id", desc: "이 선택지를 골랐을 때 실행할 효과 묶음이에요. effects 표의 group 이름을 씁니다." },
      { name: "next_event", desc: "고른 뒤 이어서 띄울 이벤트예요. 적어 두면 선택이 다음 장면으로 이어지고, 그게 또 CHOICE면 계속 이어집니다. events 표의 id를 써요." },
      { name: "한 가지 당부", desc: "한 이벤트에는 조건 없는 선택지를 적어도 하나 두세요. 모든 선택지에 조건이 걸리면, 조건을 못 채운 플레이어가 아무것도 고르지 못해 막힐 수 있어요." },
    ],
  },
  effects: {
    overview:
      "이벤트나 선택지가 실제로 일으키는 변화예요. 자원을 올리고, 칸을 옮기고, 상태를 거는 일이 전부 여기서 일어납니다. 같은 group으로 묶인 줄들은 seq 순서대로 차례차례 실행돼요.",
    rows: [
      { name: "id", desc: "줄 하나를 구분하는 고유 이름이에요. 보통 group_id에 순서를 붙여 짓습니다(참조엔 group_id를 씀)." },
      { name: "group_id", desc: "여러 효과를 하나로 묶는 참조값이에요. 이벤트의 payload나 선택지의 result_effect_id가 이 group_id를 부르면, 묶인 줄이 다 실행됩니다." },
      { name: "seq", desc: "그룹 안에서 실행될 차례예요. 작은 수부터 순서대로 돌아갑니다." },
      { name: "kind", desc: "어떤 종류의 효과인지예요. 쓸 수 있는 종류는 아래에 정리해 뒀어요." },
      { name: "target", desc: "효과가 미칠 대상이에요. 자원 id, 상태 id, 칸 id처럼 종류에 따라 가리키는 게 달라집니다." },
      { name: "value", desc: "효과의 양이나 값이에요. 얼마나 올릴지, 몇 칸 옮길지, 어떤 메시지를 띄울지를 적어요." },
      { name: "· GAIN / LOSE", desc: "target 자원을 value만큼 올리거나 내려요." },
      { name: "· SET", desc: "target 자원을 value 값으로 딱 맞춰 놓아요." },
      { name: "· GIVE_ITEM / TAKE_ITEM", desc: "target 아이템을 value(기본 1)만큼 주거나 빼앗습니다." },
      { name: "· CHANGE_TILE", desc: "target 칸(예: t_43-t_48)의 종류를 value(예: positive)로 바꿉니다." },
      { name: "· MOVE_TO", desc: "value에 적은 칸으로 곧장 옮겨요." },
      { name: "· MOVE_DELTA", desc: "지금 자리에서 value 칸만큼 움직여요. 음수면 뒤로 갑니다." },
      { name: "· SKIP_TURN", desc: "다음 턴을 한 번 쉬어요." },
      { name: "· SET_FLAG", desc: "target 플래그를 value로 세워요. 나중에 조건에서 flag.<이름>으로 확인할 수 있어요." },
      { name: "· MSG", desc: "value에 적은 메시지를 로그에 띄워요." },
      { name: "· RUN_EVENT", desc: "target 이벤트를 이어서 실행해요. 효과 도중에 다른 이벤트를 끼워 넣는 셈이에요." },
      { name: "· APPLY_STATUS / CLEAR_STATUS", desc: "target 상태를 걸거나 풀어요. APPLY_STATUS의 value로 지속 턴을 덮어쓸 수 있어요." },
      { name: "· DEFEAT/STUN/PUSH_ENEMY", desc: "접촉한 적을 없애거나, value 턴 멈추게 하거나, value 칸 밀어내요. 적과 부딪쳐 생긴 이벤트의 선택지에서 써요." },
    ],
  },
  generation: {
    overview:
      "비어 있는 칸을 어떤 종류로 채울지 정하는 규칙이에요. 지역마다 칸 타입의 가중치를 적어 두면, 생성기가 그 비율대로 빈 칸을 뽑아 채웁니다.",
    rows: [
      { name: "region", desc: "규칙이 적용될 지역이에요. tiles의 region과 이름을 맞춰요." },
      { name: "tile_type", desc: "채워 넣을 칸 타입이에요. 여기서 정해지는 건 칸의 종류까지고, 도착했을 때 어떤 이벤트가 뜰지는 tile_events가 따로 정합니다." },
      { name: "weight", desc: "같은 지역 안에서의 상대적인 비중이에요. 수가 클수록 자주 뽑힙니다." },
    ],
  },
  tile_events: {
    overview:
      "칸 타입마다 도착했을 때 뜰 이벤트의 후보 묶음이에요. event_id를 따로 정하지 않은 칸에 적용돼요. 후보가 여럿이면 가중치대로 하나를 뽑습니다.",
    rows: [
      { name: "tile_type", desc: "이 풀이 적용될 칸 타입이에요." },
      { name: "event_id", desc: "후보 이벤트예요. events 표의 id를 적습니다." },
      { name: "weight", desc: "풀 안에서의 상대적인 비중이에요. 클수록 자주 뽑혀요." },
      { name: "cond_group", desc: "이 후보가 뽑힐 자격 조건이에요. 못 채운 줄은 후보에서 빠진 채로 추첨합니다." },
    ],
  },
  conditions: {
    overview:
      "다른 표들이 '언제'를 판단할 때 가져다 쓰는 조건이에요. 한 줄이 '무엇을 어떻게 비교한다'는 술어 하나고, 같은 group으로 묶인 술어는 모두 참이어야 통과합니다. 묶음이 곧 AND예요. OR는 없으니, 갈래가 필요하면 앞선 효과에서 플래그를 세워 나눠요.",
    rows: [
      { name: "id", desc: "줄을 구분하는 형식상 고유 이름이에요(참조엔 안 쓰임). 의미 없는 surrogate로 적어요." },
      { name: "group_id", desc: "조건을 묶는 참조값이에요. 다른 표의 cond_group이 이 값을 부릅니다. 같은 group_id 줄이 전부 참이어야 통과해요(=AND)." },
      { name: "subject", desc: "무엇을 볼지예요. 자원 id를 적거나, flag.<이름>으로 플래그를, status.<id>로 남은 상태 턴을 봅니다." },
      { name: "op", desc: "어떻게 비교할지예요. min은 이상, max는 이하, over는 초과, under는 미만, is는 같음, not은 다름이에요. 엑셀이 수식으로 오해하지 않도록 기호 대신 이 낱말을 씁니다." },
      { name: "value", desc: "비교할 값이에요. 숫자나 true·false를 적어요. 읽으면 그대로 문장이 됩니다 — gold min 5는 '골드가 5 이상'이라는 뜻이에요." },
    ],
  },
  assets: {
    overview:
      "그림과 소리 파일의 경로를 모아 두는 전역 표예요. 다른 곳에서는 여기 적은 id로 자산을 부릅니다. VN 캐릭터(kind=sprite)도 여기에 둡니다 — 별도 표를 만들지 않아요.",
    rows: [
      { name: "id", desc: "자산을 가리키는 이름이에요." },
      { name: "kind", desc: "image면 그림, audio면 소리, sprite면 VN에 등장하는 캐릭터예요." },
      { name: "path", desc: "파일이 있는 경로예요. /로 시작하면 public 기준 절대경로." },
      { name: "speaker · expr · pos", desc: "kind=sprite일 때만 써요. speaker는 기본 화자명(events.speaker가 비면 이걸 씀), expr은 표정 태그(지금은 자리만), pos는 화면에서의 위치(left/center/right, 기본 center)." },
    ],
  },
  stages: {
    overview:
      "게임에 담긴 스테이지 목록이에요. 전역 표라서 데이터 폴더 맨 위에 하나만 둡니다. 줄을 더하면 스테이지가 늘어나요.",
    rows: [
      { name: "id", desc: "스테이지를 가리키는 이름이에요." },
      { name: "name", desc: "메뉴에 보여 줄 이름이에요." },
      { name: "description", desc: "스테이지를 한 줄로 소개하는 글이에요." },
      { name: "config_path", desc: "이 스테이지의 CSV들이 들어 있는 폴더 경로예요." },
      { name: "unlock_cost", desc: "0이면 처음부터 열려 있고, 0보다 크면 메타 포인트를 그만큼 써야 열립니다." },
      { name: "icon", desc: "목록에 띄울 아이콘이에요." },
    ],
  },
  endings: {
    overview:
      "게임이 끝날 때 자원과 플래그를 보고 골라 보여 주는 여러 결말이에요. 두지 않아도 되는 선택 표고, 두면 같은 승리라도 상황에 따라 다른 마무리를 띄울 수 있어요.",
    rows: [
      { name: "id", desc: "결말을 가리키는 이름이에요." },
      { name: "when", desc: "어떤 끝에서 후보가 될지예요. victory는 승리, defeat는 패배, any는 둘 다입니다." },
      { name: "cond_group", desc: "이 결말이 뽑힐 조건이에요. 비우면 늘 참으로 봅니다." },
      { name: "priority", desc: "여러 결말이 조건을 채웠을 때 누구를 먼저 볼지예요. 수가 클수록 먼저 따지고, 처음으로 들어맞는 결말을 씁니다." },
      { name: "title", desc: "결과 화면 제목이에요." },
      { name: "text", desc: "결과 화면 본문이에요." },
      { name: "icon", desc: "결과 화면 아이콘이에요." },
      { name: "image", desc: "결과 화면 그림이에요. 없으면 아이콘이나 기본 이모지로 대신해요." },
    ],
  },
  characters: {
    overview:
      "새 게임을 시작할 때 고르는 캐릭터예요. 두지 않아도 되는 선택 표고, 두면 시작할 때 고른 캐릭터의 초상과 이름, 시작 효과를 받습니다.",
    rows: [
      { name: "id", desc: "캐릭터를 가리키는 이름이에요." },
      { name: "name", desc: "캐릭터 이름이에요. 고르면 config의 player_name을 덮어씁니다." },
      { name: "portrait", desc: "캐릭터 초상이에요. 이모지나 이미지 경로를 적고, config의 portrait를 덮어써요." },
      { name: "desc", desc: "선택 화면에 보여 줄 소개 글이에요." },
      { name: "start_effect_group", desc: "이 캐릭터를 골랐을 때 딱 한 번 받는 효과 묶음이에요. 시작 자원을 보정하는 데 써요. effects의 group 이름을 적습니다." },
      { name: "icon", desc: "선택 버튼 앞에 띄울 이모지예요. 비우면 초상이 이모지일 때 그걸 대신 써요." },
    ],
  },
  derived: {
    overview:
      "다른 스탯에서 저절로 계산되는 스탯이에요. 전역(런) 표라 data/ 루트에 둡니다. 결과는 기본값에 '입력 스탯 × 가중치'를 모두 더한 값이고, 재료 스탯이 바뀌면 알아서 다시 계산돼요. (전역→스테이지를 가리키지 않도록 stats만 참조)",
    rows: [
      { name: "id", desc: "줄을 구분하는 형식상 고유 이름이에요(참조엔 안 쓰임). 숫자 범위 인덱스(100001~)로 적길 권해요." },
      { name: "target", desc: "계산 결과를 담을 스탯이에요. stats의 id를 적습니다. 이 스탯은 계산 전용이라, 효과로 직접 건드리지 마세요." },
      { name: "term", desc: "계산에 넣을 입력 스탯이에요. 비우면 그냥 상수 항이 되어 factor만 더해집니다." },
      { name: "factor", desc: "가중치예요. 입력 스탯이 있으면 곱하고, 없으면 그 값을 그대로 더해요." },
      { name: "읽는 법", desc: "같은 target을 가진 줄을 모두 합쳐 한 값을 만들어요. 예를 들어 '공격력 = 1 + 기력 + 열쇠×2' 같은 식을 여러 줄로 나눠 적습니다." },
    ],
  },
  thresholds: {
    overview:
      "자원이나 상태가 어떤 선을 넘는 순간을 잡아 무언가를 터뜨리는 방아쇠예요. 두지 않아도 되는 선택 표고, 조건이 거짓에서 참으로 바뀌는 바로 그 순간에만 발동해요. 이미 참인 상태로 시작하면 발동하지 않습니다.",
    rows: [
      { name: "id", desc: "방아쇠를 가리키는 이름이에요." },
      { name: "subject", desc: "지켜볼 대상이에요. 자원 id, flag.<이름>, status.<id> 중에서 적어요." },
      { name: "op", desc: "어떻게 비교할지예요. conditions와 똑같이 min·max·over·under·is·not을 씁니다." },
      { name: "value", desc: "넘는지 볼 기준 값이에요." },
      { name: "event · effect", desc: "넘는 순간 무엇을 할지예요. event를 적으면 그 이벤트를, 비었으면 effect 묶음을 실행해요. 둘 다 있으면 event가 먼저입니다." },
      { name: "mode", desc: "once면 한 게임에 한 번만, repeat면 넘을 때마다 발동해요. 비우면 repeat예요." },
    ],
  },
  enemies: {
    overview:
      "보드를 돌아다니는 적이에요. 두지 않아도 되는 선택 표예요. 같은 칸에서 마주치면 그 적의 이벤트가 떠요. 대개 선택지(싸운다·도망친다·뇌물)가 뜨고, 고른 선택지의 효과로 적을 처리합니다.",
    rows: [
      { name: "id", desc: "적을 가리키는 이름이에요." },
      { name: "label", desc: "이름표예요. 보드에서 토큰에 마우스를 올리면 보여요." },
      { name: "icon", desc: "보드에 띄울 아이콘이에요." },
      { name: "start", desc: "처음 놓일 칸이에요. tiles의 id를 적어요." },
      { name: "behavior", desc: "어떻게 움직일지예요. chase는 쫓아오고, wander는 어슬렁대고, ambush는 숨었다가 시야에 들면 쫓고, turret은 자리에 박혀 쏘고, ranged는 다가와서 원거리로 칩니다." },
      { name: "speed", desc: "한 턴에 몇 번 움직일지예요." },
      { name: "damage", desc: "접촉 이벤트가 없을 때 그냥 입히는 기본 피해예요. 비우면 1이에요." },
      { name: "event", desc: "마주치거나 사격당할 때 뜰 이벤트예요. events의 id를 적고, 보통 CHOICE로 만들어 선택지에서 적을 처리해요." },
      { name: "vision", desc: "ambush·turret·ranged가 플레이어를 알아채는 거리예요. 비우면 3이에요." },
      { name: "contact", desc: "언제 마주친 걸로 칠지예요. move는 적이 내 칸에 왔을 때, pass는 내가 지나가다 적을 밟았을 때, both는 둘 다입니다." },
      { name: "sprite", desc: "토큰 그림이에요. assets의 id를 적어요." },
      { name: "cond_group", desc: "이 적이 등장할 조건이에요. 비우면 늘 나옵니다." },
    ],
  },
  items: {
    overview:
      "플레이어가 들고 다니며 쓰는 아이템이에요. 두지 않아도 되는 선택 표예요. HP·골드처럼 늘 보이는 자원과 달리, 챙겨 뒀다가 필요할 때 꺼내 씁니다. 효과 GIVE_ITEM으로 지급하고 TAKE_ITEM으로 거두며, 조건에서는 item.<id>로 보유 수를 봅니다. 칩을 누르면 쓰이는데, 쓰는 건 주사위를 굴리기 전(턴 대기) 순간에만 됩니다.",
    rows: [
      { name: "id", desc: "아이템을 가리키는 이름이에요. 효과(GIVE_ITEM/TAKE_ITEM)와 조건(item.<id>)에서 이 id로 지목합니다." },
      { name: "name", desc: "화면(칩 툴팁·사용 알림)에 보여 줄 이름이에요." },
      { name: "icon", desc: "인벤토리 칩에 띄울 이모지예요." },
      { name: "desc", desc: "어떤 아이템인지 한 줄 설명이에요. 칩에 마우스를 올리면 보여요." },
      { name: "use_effect_group", desc: "쓸 때 실행할 효과 묶음이에요. effects의 group을 적어요. 비우면 들고만 있고 쓸 수는 없는 아이템이 됩니다." },
      { name: "consumable", desc: "1이면 쓸 때 한 개가 줄어요(소모품). 0이면 써도 줄지 않습니다. 비우면 소모품으로 봐요." },
      { name: "max_stack", desc: "최대 몇 개까지 챙길 수 있는지예요. 비우거나 0이면 무제한이고, 넘치는 만큼은 버립니다." },
      { name: "cond_group", desc: "쓸 수 있는 조건이에요. 비우면 늘 쓸 수 있고, 적어 두면 조건을 채웠을 때만 칩이 켜집니다. conditions의 group을 적어요." },
    ],
  },
  meta: {
    overview:
      "한 게임이 끝나도 사라지지 않고 남는 영구 업그레이드예요. 전역 표라서 데이터 폴더 맨 위에 둡니다. 모은 메타 포인트로 사 두면 다음 판부터 더 세게 시작할 수 있어요.",
    rows: [
      { name: "id", desc: "업그레이드를 가리키는 이름이에요." },
      { name: "label", desc: "상점에 보여 줄 이름이에요." },
      { name: "description", desc: "어떤 업그레이드인지 한 줄 설명이에요." },
      { name: "cost", desc: "한 랭크 올리는 데 드는 메타 포인트예요." },
      { name: "effect_kind", desc: "어떤 식으로 효과를 줄지예요." },
      { name: "target", desc: "효과가 닿을 자원이에요. 게임을 시작할 때 그 자원에 반영돼요. resources의 id를 적어요." },
      { name: "value", desc: "랭크 하나당 더해 줄 효과의 크기예요." },
      { name: "max_rank", desc: "최대 몇 랭크까지 올릴 수 있는지예요." },
    ],
  },
};

// ───────── 엑셀 작업 편의 메타 (csv-sync 하이브리드 워크북용) ─────────

// 도메인 = 작업자 관점 묶음. 탭 색(ARGB) + 소속 테이블. 도메인 워크북도 이 단위로 분리.
export const DOMAINS = {
  map:       { label: "맵",       color: "FF2E7D32", tables: ["tiles", "edges", "generation", "tile_events"] },
  narrative: { label: "내러티브", color: "FF1565C0", tables: ["events", "choices", "effects", "conditions", "endings"] },
  entity:    { label: "엔티티",   color: "FFE65100", tables: ["stats", "characters", "enemies", "derived", "thresholds", "items"] },
  setup:     { label: "전역",     color: "FF455A64", tables: ["config", "stages", "meta", "assets", "ui"] },
};
export function domainOf(table) {
  for (const [d, v] of Object.entries(DOMAINS)) if (v.tables.includes(table)) return d;
  return "setup";
}

// v2 스코프 레이어. 전역(런)=data/ 루트 한 벌, 스테이지=data/<stage>/ 폴더마다.
// csv-sync/검증이 "이 표가 어느 레이어에 있어야 하는지" 판단하는 근거.
export const GLOBAL_TABLES = ["stats", "derived", "generation", "assets", "stages", "meta", "ui"];
export const STAGE_TABLES = [
  "config", "tiles", "edges", "events", "choices", "effects", "conditions", "tile_events",
  "endings", "characters", "thresholds", "enemies", "items",
];
export function layerOf(table) {
  return GLOBAL_TABLES.includes(table) ? "global" : "stage";
}

// FK 참조: "테이블.컬럼" → "참조테이블.참조컬럼". 드롭다운/헬퍼열 생성에 사용.
// FK는 group → group_id 리네임 반영. derived/meta/stats 매 턴 대상은 전역 stats.id를 가리킨다.
export const REFS = {
  "edges.from": "tiles.id", "edges.to": "tiles.id", "edges.cond_group": "conditions.group_id",
  "tiles.event_id": "events.id", "tiles.sprite": "assets.id",
  "events.payload": "effects.group_id", "events.cond_group": "conditions.group_id",
  "events.sprite1": "assets.id", "events.sprite2": "assets.id", "events.sprite3": "assets.id", "events.background": "assets.id",
  "choices.event_id": "events.id", "choices.result_effect_id": "effects.group_id",
  "choices.cond_group": "conditions.group_id", "choices.next_event": "events.id",
  "tile_events.event_id": "events.id", "tile_events.cond_group": "conditions.group_id",
  "endings.cond_group": "conditions.group_id",
  "characters.start_effect_group": "effects.group_id",
  "stats.per_turn_target": "stats.id",
  "derived.target": "stats.id", "derived.term": "stats.id",
  "thresholds.event": "events.id", "thresholds.effect": "effects.group_id",
  "enemies.start": "tiles.id", "enemies.event": "events.id", "enemies.cond_group": "conditions.group_id",
  "items.use_effect_group": "effects.group_id", "items.cond_group": "conditions.group_id",
  "meta.target": "stats.id",
};

// enum: "테이블.컬럼" → 허용 값 목록. 드롭다운에 직접 사용.
const OPS = ["min", "max", "over", "under", "is", "not"];
export const ENUMS = {
  "events.type": ["EFFECT", "CHOICE", "MOVE", "NONE"],
  "conditions.op": OPS, "thresholds.op": OPS,
  "thresholds.mode": ["once", "repeat"],
  "endings.when": ["victory", "defeat", "any"],
  "enemies.behavior": ["chase", "wander", "ambush", "turret", "ranged"],
  "enemies.contact": ["move", "pass", "both"],
  "assets.kind": ["image", "audio", "sprite"],
  "assets.pos": ["left", "center", "right"],
  "stats.kind": ["number", "bool", "status"],
  "stats.display": ["bar", "counter", "flag", "hidden"],
  "effects.kind": ["GAIN", "LOSE", "SET", "MOVE_TO", "MOVE_DELTA", "SKIP_TURN", "SET_FLAG", "MSG",
    "RUN_EVENT", "APPLY_STATUS", "CLEAR_STATUS", "DEFEAT_ENEMY", "STUN_ENEMY", "PUSH_ENEMY",
    "GIVE_ITEM", "TAKE_ITEM", "CHANGE_TILE"],
  "items.consumable": ["1", "0"],
};

// 참조 대상 테이블에서 "이름"으로 쓸 컬럼(헬퍼열 표시용). 없으면 헬퍼열 생략.
export const NAME_COL = {
  tiles: "label", events: "title", stats: "label", characters: "name",
  enemies: "label", assets: "id", stages: "name", items: "name",
};

// ───────── i18n 번역 추출 대상 (data:strings) ─────────
// 표 → 번역할 텍스트 컬럼들. 키는 엔진의 td()/tu() 조회 형식과 정확히 일치해야 한다
// (안 그러면 추출한 키를 아무도 안 찾음). 키 형식: <키표>_<id>_<컬럼>.
// 코드가 실제로 td()로 해소하는 컬럼만 넣는다(미배선 컬럼은 죽은 키가 되므로 제외).
//   · stats.label 은 코드가 td("resources", id, "label")로 조회 → 키표를 resources로 치환(STRING_KEY_TABLE).
//   · config 는 key/value라 id=스테이지 폴더, 컬럼=설정 키(board_name 등) — 추출기에서 특수 처리.
//   · effects 는 kind=MSG 행의 value만 — 추출기에서 특수 처리.
//   · choices 는 id가 "<event_id>_<choice_id>" 복합 — 추출기에서 특수 처리.
export const TEXT_COLS = {
  stats: ["label"],
  events: ["title", "text"],
  endings: ["title", "text"],
  characters: ["name", "desc"],
  enemies: ["label"],
  items: ["name", "desc"],
  meta: ["label", "description"],
  stages: ["name", "description"],
  // 특수 처리 표(추출기 참고용 — 컬럼은 아래 주석대로):
  config: ["board_name"],   // → config_<stage>_board_name
  choices: ["text"],        // → choices_<event>_<choice>_text
  effects: ["value"],       // kind=MSG 행만 → effects_<id>_value
};
// 키 생성 시 표 이름 치환(코드가 다른 이름으로 조회하는 경우).
export const STRING_KEY_TABLE = { stats: "resources" };
// ── UI 확장 키 목록 ──
// src/ui/UiSettings.ts의 UI_KEYS 선언과 짝을 이루는 목록(검증 경고용).
// config.csv/ui.csv는 key/value 표라 "행 추가"가 곧 확장 — 이 목록은 구조가 아니라
// "오타 감지" 근거다. validate가 여기 없는 키를 경고(warn)하되 에러로 막지는 않는다.
// UiSettings.ts에 키를 추가하면 여기에도 한 줄 추가할 것.
export const UI_SETTING_KEYS = [
  // 보드 카메라(줌/팬)
  "board_zoom", "board_zoom_min", "board_zoom_max", "board_zoom_default", "board_zoom_step",
  "board_pan", "board_zoom_buttons", "board_follow_player",
  "board_fit_padding", "board_cell_min", "board_cell_max",
  // 포트레이트/캐릭터 패널
  "portrait_size", "portrait_fit", "portrait_radius", "portrait_border",
  "char_body_width", "char_panel_pos", "char_panel_x", "char_panel_y",
  "char_panel_opacity", "char_panel_scale", "char_name_size", "char_panel_max_width",
  // 전체/영역 배율
  "ui_scale", "hud_scale", "log_scale", "popup_scale", "vn_scale", "footer_scale",
  // 표시 토글/배치
  "show_header", "show_progress", "show_log", "show_dice_result", "show_status",
  "log_pos", "log_width", "log_max_lines", "log_font_size", "progress_height",
  // 애니메이션
  "anim_step_ms", "enemy_step_ms", "anim_speed",
  // 팝업/아트/VN
  "popup_min_width", "popup_max_width", "popup_radius",
  "popup_art_height", "popup_art_fit", "result_art_size", "result_art_fit",
  "vn_frame_width", "vn_frame_height", "vn_side_width", "vn_text_size", "vn_dim",
  // 오디오
  "bgm_volume", "sfx_volume",
  // 상태/인벤 칩
  "status_chip_size", "inv_chip_size",
  // 타일 라벨 표시
  "tile_label_mode", "tile_type_label",
  // 주사위 연출
  "dice_anim", "dice_anim_ms",
  // VN 타자기
  "vn_text_speed",
  // 로그 히스토리
  "log_history",
  // 키보드 단축키
  "hotkey_roll", "hotkey_mute", "hotkey_zoom_in", "hotkey_zoom_out", "hotkey_zoom_reset",
];

// 접두 키(키 뒤에 임의 이름이 붙는 패턴) — 미지 키 경고에서 제외.
//   cssvar.<이름>          임의 CSS 변수 주입
//   hud_bar_color.<stat>   해당 스탯의 HUD 게이지 색
export const UI_KEY_PREFIXES = ["cssvar.", "hud_bar_color."];

// config.csv의 엔진 키(게임 규칙·보드 외형). UI_SETTING_KEYS와 합쳐 "알려진 config 키"가 된다.
export const CONFIG_ENGINE_KEYS = [
  "start_tile", "goal_tile", "seed", "board_name", "generator", "dice", "dice_sides",
  "player_name", "portrait", "player_sprite", "bgm", "lose_cond_group", "on_turn_start", "on_turn_end",
  "board_bg", "edge_color", "edge_width", "tile_pad", "tile_radius",
  "tile_border", "tile_border_width", "locked_border",
  "player_color", "enemy_color", "token_stroke", "token_radius",
];

// ui.csv의 테마/부팅 키(theme.ts가 소비). UI_SETTING_KEYS와 합쳐 "알려진 ui 키"가 된다.
export const UI_THEME_KEYS = [
  "app_name", "app_tagline", "lang", "font_family", "ui_radius",
  "accent", "accent_dim", "bg", "card", "border", "text", "muted",
  "menu_bg", "menu_bg_image", "stage_bg_image", "result_bg_image", "meta_bg_image", "btn_image",
];

// ui.csv의 "텍스트" 키(번역 대상). 코드는 tu("app_name", ui값)로 해소하므로 ko는 ui.csv에서 가져온다.
// → 추출 키: UI_<key> (예 UI_app_name). 색·경로 등 비텍스트 키는 제외.
export const UI_TEXT_KEYS = ["app_name", "app_tagline"];
