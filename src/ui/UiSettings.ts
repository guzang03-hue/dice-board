import { assetUrl } from "../core/assetUrl";
// UI 설정 해석 계층 — "코드 기본값 ← ui.csv(전역) ← config.csv(스테이지)" 3단 캐스케이드.
// 모든 키는 기존 key/value 테이블의 행 추가로만 표현된다(칼럼·테이블 구조 불변).
//
//  - cssVar가 선언된 키는 resolve된 값(기본값 포함)을 :root CSS 변수로 매번 주입한다.
//    스테이지를 옮겨도 이전 스테이지 값이 남지 않도록 "항상 전체 키를 다시 쓴다".
//  - "cssvar.<이름>" 접두 키는 임의 CSS 변수로 그대로 통과한다 — 코드 수정 없이
//    테이블에서 새 외형 변수를 만들 수 있는 범용 통로.
//  - 키 목록은 tools/schema-meta.mjs의 KNOWN_UI_KEYS(검증 경고용)와 함께 관리한다.
//    여기 키를 추가하면 그쪽 목록에도 한 줄 추가할 것.

export type UiKeyKind = "px" | "float" | "int" | "bool" | "enum" | "string";

export interface UiKeyDef {
  key: string;
  kind: UiKeyKind;
  def: string | number | boolean;   // 코드 기본값(테이블에 키가 없을 때)
  cssVar?: string;                  // 있으면 CSS 변수로 주입(px는 단위 부여)
  min?: number;
  max?: number;
  values?: string[];                // enum 허용값(소문자). 밖이면 기본값으로
}

// ── 키 선언부 — 키 1개 = 1줄. 새 제어점은 여기에만 추가하면 된다. ──
export const UI_KEYS: UiKeyDef[] = [
  // 보드 카메라(줌/팬) — GameScene/CanvasRenderer가 소비
  { key: "board_zoom",          kind: "bool",  def: true },
  { key: "board_zoom_min",      kind: "float", def: 0.5, min: 0.1, max: 1 },
  { key: "board_zoom_max",      kind: "float", def: 3,   min: 1,   max: 10 },
  { key: "board_zoom_default",  kind: "float", def: 1,   min: 0.1, max: 10 },
  { key: "board_zoom_step",     kind: "float", def: 0.15, min: 0.01, max: 1 },
  { key: "board_pan",           kind: "bool",  def: true },
  { key: "board_zoom_buttons",  kind: "bool",  def: true },
  { key: "board_follow_player", kind: "bool",  def: false },
  { key: "board_fit_padding",   kind: "int",   def: 24, min: 0, max: 200 },
  { key: "board_cell_min",      kind: "int",   def: 24, min: 8,  max: 512 },
  { key: "board_cell_max",      kind: "int",   def: 96, min: 8,  max: 512 },

  // 포트레이트/캐릭터 패널
  { key: "portrait_size",        kind: "px",    def: 52, min: 16, max: 512, cssVar: "--portrait-size" },
  { key: "portrait_fit",         kind: "enum",  def: "cover", values: ["cover", "contain", "fill"], cssVar: "--portrait-fit" },
  { key: "portrait_radius",      kind: "string", def: "10px", cssVar: "--portrait-radius" },   // "50%"=원형
  { key: "portrait_border",      kind: "string", def: "", cssVar: "--portrait-border" },       // 빈=테마 기본
  { key: "char_body_width",      kind: "px",    def: 122, min: 60, max: 600, cssVar: "--char-body-width" },
  { key: "char_panel_pos",       kind: "enum",  def: "tl", values: ["tl", "tr", "bl", "br"] },
  { key: "char_panel_x",         kind: "px",    def: 12, min: 0, max: 400, cssVar: "--char-panel-x" },
  { key: "char_panel_y",         kind: "px",    def: 12, min: 0, max: 400, cssVar: "--char-panel-y" },
  { key: "char_panel_opacity",   kind: "float", def: 0.82, min: 0, max: 1, cssVar: "--char-panel-opacity" },
  { key: "char_panel_scale",     kind: "float", def: 1, min: 0.5, max: 3 },
  { key: "char_name_size",       kind: "px",    def: 14, min: 8, max: 48, cssVar: "--char-name-size" },
  { key: "char_panel_max_width", kind: "string", def: "min(80vw, 520px)", cssVar: "--char-panel-max-width" },

  // 전체/영역 배율 — GameScene이 곱해서 --scale-* 변수로 주입
  { key: "ui_scale",     kind: "float", def: 1, min: 0.5, max: 2.5 },
  { key: "hud_scale",    kind: "float", def: 1, min: 0.5, max: 3 },
  { key: "log_scale",    kind: "float", def: 1, min: 0.5, max: 3 },
  { key: "popup_scale",  kind: "float", def: 1, min: 0.5, max: 3 },
  { key: "vn_scale",     kind: "float", def: 1, min: 0.5, max: 3 },
  { key: "footer_scale", kind: "float", def: 1, min: 0.5, max: 3 },

  // 표시 토글/배치
  { key: "show_header",      kind: "bool", def: true },
  { key: "show_progress",    kind: "bool", def: true },
  { key: "show_log",         kind: "bool", def: true },
  { key: "show_dice_result", kind: "bool", def: true },
  { key: "show_status",      kind: "bool", def: true },
  { key: "log_pos",          kind: "enum", def: "br", values: ["br", "bl", "tr", "tl"] },
  { key: "log_width",        kind: "px",  def: 180, min: 80, max: 600, cssVar: "--log-width" },
  { key: "log_max_lines",    kind: "int", def: 10, min: 1, max: 100 },
  { key: "log_font_size",    kind: "px",  def: 11, min: 8, max: 24, cssVar: "--log-font-size" },
  { key: "progress_height",  kind: "px",  def: 16, min: 4, max: 48, cssVar: "--progress-height" },

  // 애니메이션
  { key: "anim_step_ms",  kind: "int",   def: 220, min: 0, max: 2000 },
  { key: "enemy_step_ms", kind: "int",   def: 120, min: 0, max: 2000 },
  { key: "anim_speed",    kind: "float", def: 1, min: 0.25, max: 8 },

  // 팝업/이벤트 아트/결과 아트 (기존 applyImageSpecs 키 + 확장)
  { key: "popup_min_width",  kind: "px",   def: 300, min: 200, max: 800, cssVar: "--popup-min-width" },
  { key: "popup_max_width",  kind: "px",   def: 460, min: 240, max: 1200, cssVar: "--popup-max-width" },
  { key: "popup_radius",     kind: "px",   def: 12, min: 0, max: 40, cssVar: "--popup-radius" },
  { key: "popup_art_height", kind: "px",   def: 120, min: 40, max: 600, cssVar: "--popup-art-height" },
  { key: "popup_art_fit",    kind: "enum", def: "cover", values: ["cover", "contain", "fill"], cssVar: "--popup-art-fit" },
  { key: "result_art_size",  kind: "px",   def: 160, min: 40, max: 600, cssVar: "--result-art-size" },
  { key: "result_art_fit",   kind: "enum", def: "contain", values: ["cover", "contain", "fill"], cssVar: "--result-art-fit" },

  // VN 오버레이
  { key: "vn_frame_width",  kind: "string", def: "92%", cssVar: "--vn-frame-width" },
  { key: "vn_frame_height", kind: "string", def: "88%", cssVar: "--vn-frame-height" },
  { key: "vn_side_width",   kind: "string", def: "minmax(260px, 28%)", cssVar: "--vn-side-width" },
  { key: "vn_text_size",    kind: "px",    def: 14, min: 10, max: 32, cssVar: "--vn-text-size" },
  { key: "vn_dim",          kind: "float", def: 0.72, min: 0, max: 1, cssVar: "--vn-dim" },

  // 오디오
  { key: "bgm_volume", kind: "float", def: 0.3, min: 0, max: 1 },
  { key: "sfx_volume", kind: "float", def: 0.6, min: 0, max: 1 },

  // 상태/인벤 칩
  { key: "status_chip_size", kind: "px", def: 11, min: 8, max: 32, cssVar: "--status-chip-size" },
  { key: "inv_chip_size",    kind: "px", def: 16, min: 10, max: 40, cssVar: "--inv-chip-size" },

  // 타일 라벨 표시 (캔버스)
  { key: "tile_label_mode", kind: "enum", def: "full", values: ["full", "short", "none"] },  // short=label 있는 칸만, none=숨김
  { key: "tile_type_label", kind: "bool", def: true },                                       // 칸 상단 타입 텍스트

  // 주사위 연출 (표시 전용 — 결과값은 이미 확정, 시드 RNG 미사용)
  { key: "dice_anim",    kind: "enum", def: "none", values: ["none", "spin"] },
  { key: "dice_anim_ms", kind: "int",  def: 600, min: 100, max: 5000 },

  // VN 타자기 효과 (글자당 ms. 0=즉시. 텍스트 창 클릭=전체 출력)
  { key: "vn_text_speed", kind: "int", def: 0, min: 0, max: 200 },

  // 이벤트 로그 히스토리 (로그 클릭 → 이번 런 전체 로그 모달. 켜면 로그 영역이 클릭을 가로챔)
  { key: "log_history", kind: "bool", def: false },

  // 키보드 단축키 (KeyboardEvent.key 소문자. "space"=스페이스바. 빈 값=비활성)
  { key: "hotkey_roll",       kind: "string", def: "space" },
  { key: "hotkey_mute",       kind: "string", def: "m" },
  { key: "hotkey_zoom_in",    kind: "string", def: "=" },
  { key: "hotkey_zoom_out",   kind: "string", def: "-" },
  { key: "hotkey_zoom_reset", kind: "string", def: "0" },
];

// 접두 키: hud_bar_color.<stat_id> = 해당 스탯 게이지 색(#hex 등).
// cssvar.* 처럼 선언 없이 통과하는 패턴이라 validate의 미지 키 경고에서도 제외된다.
export const HUD_BAR_COLOR_PREFIX = "hud_bar_color.";

const DEFS = new Map(UI_KEYS.map(d => [d.key, d]));
const CSSVAR_PREFIX = "cssvar.";

export class UiSettings {
  private map: Record<string, string> = {};

  // 전역(ui.csv raw) 위에 스테이지(config.csv)를 덮는다. 빈 문자열은 "미기재"로 보고 건너뛴다.
  constructor(globalRaw: Record<string, string>, stageCfg: Record<string, unknown>) {
    for (const [k, v] of Object.entries(globalRaw)) {
      const s = String(v ?? "").trim();
      if (s !== "") this.map[k] = s;
    }
    for (const [k, v] of Object.entries(stageCfg)) {
      const s = String(v ?? "").trim();
      if (s !== "") this.map[k] = s;
    }
  }

  // 병합된 원본 맵(보드 스타일 등 자유 키 소비처용).
  asRecord(): Record<string, string> { return { ...this.map }; }

  raw(key: string): string | undefined { return this.map[key]; }

  num(key: string): number {
    const d = DEFS.get(key);
    const def = typeof d?.def === "number" ? d.def : 0;
    const v = this.map[key];
    const n = v === undefined ? def : Number(v);
    if (!Number.isFinite(n)) return def;
    const lo = d?.min ?? -Infinity, hi = d?.max ?? Infinity;
    return Math.max(lo, Math.min(hi, n));
  }

  bool(key: string): boolean {
    const d = DEFS.get(key);
    const def = typeof d?.def === "boolean" ? d.def : false;
    const v = this.map[key]?.toLowerCase();
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return def;
  }

  str(key: string): string {
    const d = DEFS.get(key);
    const def = typeof d?.def === "string" ? d.def : "";
    const v = this.map[key];
    if (v === undefined) return def;
    if (d?.kind === "enum") {
      const low = v.toLowerCase();
      return d.values?.includes(low) ? low : def;
    }
    return v;
  }

  // 선언된 cssVar 키 전체 + cssvar.* 통과 키를 root에 주입.
  // 항상 전체를 다시 써서(기본값 포함) 스테이지 간 잔류를 없앤다. 빈 값은 변수 제거.
  applyCssVars(root: HTMLElement = document.documentElement): void {
    for (const d of UI_KEYS) {
      if (!d.cssVar) continue;
      let val: string;
      if (d.kind === "px") val = `${this.num(d.key)}px`;
      else if (d.kind === "float" || d.kind === "int") val = String(this.num(d.key));
      else if (d.kind === "bool") val = this.bool(d.key) ? "1" : "0";
      else val = this.str(d.key);
      if (val === "") root.style.removeProperty(d.cssVar);
      else root.style.setProperty(d.cssVar, assetUrl(val));
    }
    for (const [k, v] of Object.entries(this.map)) {
      if (!k.startsWith(CSSVAR_PREFIX)) continue;
      const name = k.slice(CSSVAR_PREFIX.length);
      const varName = name.startsWith("--") ? name : `--${name}`;
      if (v === "") root.style.removeProperty(varName);
      else root.style.setProperty(varName, assetUrl(v));
    }
  }
}
