import { assetUrl } from "../core/assetUrl";
// 기존 main.ts의 인게임 로직을 씬으로 캡슐화.
// SceneManager.go("game", { stageId, saveRun? }) 로 진입.

import type { Scene } from "./Scene";
import type { SceneManager } from "./SceneManager";
import type { SaveManager, RunSave } from "../core/SaveManager";
import { loadGameData } from "../data/loadGameData";
import type { GameData, EndingDef, ConditionDef, CharacterDef, StatusDef, ThresholdDef, EnemyDef, ItemDef } from "../data/schema";
import { indexEffects, indexConditions } from "../data/schema";
import { evalConditions, evalPredicate } from "../core/Condition";
import { getBehavior } from "../core/behaviors";
import { TileEventResolver } from "../core/TileEventResolver";
import { Board, type Tile } from "../core/Board";
import { Player } from "../core/Player";
import { Dice, makeDice } from "../core/Dice";
import { CanvasRenderer, type BoardStyle } from "../render/CanvasRenderer";
import { Hud } from "../ui/Hud";
import { td, tu } from "../core/i18n";
import { Popup } from "../ui/Popup";
import { VNOverlay } from "../ui/VNOverlay";
import { EventEngine } from "../core/EventEngine";
import { makeRng } from "../core/Rng";
import { generateBoard } from "../core/BoardGenerator";
import { globalAudio } from "../core/globalAudio";
import { UiSettings, HUD_BAR_COLOR_PREFIX } from "../ui/UiSettings";
import { getTheme } from "../core/theme";


// 지역 키 → 표시 이름. 없으면 키 그대로 노출.
const REGION_LABEL: Record<string, string> = {
  kingdom: "왕국", forest: "숲", mountain: "산맥", dungeon: "던전", castle: "마왕성",
  town: "마을", default: "",
};

export interface GameSceneData {
  stageId: string;
  configPath: string;
  save?: RunSave | null;
  slot?: number;                                      // 저장 슬롯
  metaBonuses?: { target: string; value: number }[];  // 메타 업그레이드 적용값
}

// 적의 런타임 상태(정의 + 위치/정지/생존/활성화).
interface ActiveEnemy {
  def: EnemyDef;
  tileId: string;
  stun: number;          // >0이면 그만큼 턴 정지
  alive: boolean;
  state: { activated?: boolean };   // ambush 등 behavior 지속 상태
}

export class GameScene implements Scene {
  readonly id = "game";
  private panel!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private hudEl!: HTMLDivElement;
  private statusStripEl!: HTMLDivElement;
  private invStripEl!: HTMLDivElement;
  private portraitEl!: HTMLDivElement;
  private nameEl!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private rollBtn!: HTMLButtonElement;
  private diceResultEl!: HTMLSpanElement;

  private board: Board | null = null;
  private renderer: CanvasRenderer | null = null;
  private player: Player | null = null;
  private hud: Hud | null = null;
  private dice: Dice | null = null;
  private engine: EventEngine | null = null;
  private popup: Popup | null = null;
  private vn: VNOverlay | null = null;
  private resolver: TileEventResolver | null = null;
  private condMap: Map<string, ConditionDef[]> = new Map();
  private statusDefs: Map<string, StatusDef> = new Map();
  private itemDefs: Map<string, ItemDef> = new Map();
  // 임계 트리거: 정의 + 마지막 평가 상태(엣지 감지) + once 발동 기록
  private thresholdDefs: ThresholdDef[] = [];
  private thresholdLast: Map<string, boolean> = new Map();
  private thresholdFired: Set<string> = new Set();
  private runSeed: string | number = "";   // 이번 런 실제 시드(빈 config 시드면 즉석 생성)
  private playerTileId: string | null = null;
  private stageId: string = "";
  private slot = 0;
  private characterId?: string;   // 선택한 캐릭터 id (characters.csv 사용 시)
  private turnCount = 0;
  private busy = false;
  private skipNextTurn = false;
  private tokenPos: { x: number; y: number } | null = null;
  private rng: () => number = Math.random;
  private data: GameData | null = null;
  private resizeOff: (() => void) | null = null;
  private autoSaveInterval: number | null = null;

  // 진행도/로그 UI
  private progressFillEl!: HTMLDivElement;
  private progressTextEl!: HTMLSpanElement;
  private logEl!: HTMLDivElement;
  private distFromStart = new Map<string, number>();
  private goalDist = 1;

  // 적 (enemies.csv) — 다중. 런타임 상태로 보유.
  private enemies: ActiveEnemy[] = [];
  private currentEnemy: ActiveEnemy | null = null;   // 접촉 이벤트 처리 중인 적(처치 효과 대상)
  private ended = false;
  private configPath = "/resources/data/hero/";
  private audio = globalAudio;

  // UI 설정(코드 기본값 ← ui.csv ← config.csv) + 카메라 입력 상태(드래그 팬/핀치)
  private ui: UiSettings | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private keyOff: (() => void) | null = null;       // 단축키 리스너 해제
  private logHistory: string[] = [];                 // 이번 런 전체 로그(log_history 모달용)

  constructor(
    private sm: SceneManager,
    private saveMgr: SaveManager,
  ) {}

  async enter(raw?: unknown) {
    const input = (raw ?? {}) as GameSceneData;
    this.stageId = input.stageId ?? "hero";
    this.slot = input.slot ?? input.save?.slot ?? 0;
    this.panel = this.sm.getOrCreatePanel("game");
    this.buildDOM();
    this.sm.showPanel("game");

    await this.boot(input);
  }

  async exit() {
    this.stopAutoSave();
    if (this.resizeOff) { this.resizeOff(); this.resizeOff = null; }
    if (this.keyOff) { this.keyOff(); this.keyOff = null; }
  }

  private buildDOM() {
    this.panel.style.flexDirection = "column";
    this.panel.innerHTML = `
      <header id="game-header">
        <h1 id="game-title" title="${tu("game_back_to_menu", "메뉴로 돌아가기")}">[ 인디게임 성공기 ]</h1>
      </header>
      <div id="stage">
        <canvas id="board"></canvas>
        <aside id="char-panel">
          <div id="char-portrait">🙂</div>
          <div id="char-body">
            <div id="char-name">${tu("char_default_name", "주인공")}</div>
            <div id="hud"></div>
            <div id="status-strip" aria-label="${tu("game_status_effects", "상태 효과")}"></div>
            <div id="inv-strip" aria-label="${tu("game_inventory", "인벤토리")}"></div>
          </div>
        </aside>
        <div id="event-log" aria-label="${tu("game_event_log", "이벤트 로그")}"></div>
        <div id="board-zoom-ctrl">
          <button class="zoom-btn" id="zoom-in" title="${tu("zoom_in", "확대")}">＋</button>
          <button class="zoom-btn" id="zoom-out" title="${tu("zoom_out", "축소")}">－</button>
          <button class="zoom-btn" id="zoom-reset" title="${tu("zoom_reset", "원래대로")}">⟲</button>
        </div>
      </div>
      <div id="progress-wrap"><div id="progress-fill"></div><span id="progress-text"></span></div>
      <footer id="game-footer">
        <button class="btn" id="roll-btn">${tu("game_roll", "주사위 굴리기")}</button>
        <span id="dice-result"></span>
        <button class="btn btn-ghost" id="mute-btn" title="${tu("game_mute", "음소거")}" style="padding:6px 10px;">🔊</button>
        <span id="status"></span>
      </footer>
    `;
    this.canvas = this.panel.querySelector("#board")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.hudEl = this.panel.querySelector("#hud")!;
    this.statusStripEl = this.panel.querySelector("#status-strip")!;
    this.invStripEl = this.panel.querySelector("#inv-strip")!;
    this.portraitEl = this.panel.querySelector("#char-portrait")!;
    this.nameEl = this.panel.querySelector("#char-name")!;
    this.statusEl = this.panel.querySelector("#status")!;
    this.rollBtn = this.panel.querySelector("#roll-btn")!;
    this.diceResultEl = this.panel.querySelector("#dice-result")!;
    this.progressFillEl = this.panel.querySelector("#progress-fill")!;
    this.progressTextEl = this.panel.querySelector("#progress-text")!;
    this.logEl = this.panel.querySelector("#event-log")!;

    // 메뉴 귀환 — 진행 중(팝업 대기 등)에는 무시. 도중 이탈 시 onRoll의 finally가
    // 영영 안 돌아 busy가 박제되는 걸 막는다(boot()의 busy 리셋과 함께 이중 안전망).
    this.panel.querySelector("#game-title")!.addEventListener("click", () => {
      if (this.busy) return;
      this.autoSave();
      this.sm.go("menu");
    });

    this.rollBtn.addEventListener("click", () => this.onRoll());

    const muteBtn = this.panel.querySelector("#mute-btn") as HTMLButtonElement;
    muteBtn.addEventListener("click", () => {
      const muted = this.audio.toggleMute();
      muteBtn.textContent = muted ? "🔇" : "🔊";
    });

    // 줌 버튼 — 설정(board_zoom_step/board_zoom_default)은 boot에서 채워지므로 늦은 평가
    const zStep = () => this.ui?.num("board_zoom_step") ?? 0.15;
    (this.panel.querySelector("#zoom-in") as HTMLButtonElement).onclick = () => {
      this.renderer?.zoomBy(1 + zStep()); this.redraw();
    };
    (this.panel.querySelector("#zoom-out") as HTMLButtonElement).onclick = () => {
      this.renderer?.zoomBy(1 / (1 + zStep())); this.redraw();
    };
    (this.panel.querySelector("#zoom-reset") as HTMLButtonElement).onclick = () => {
      this.renderer?.resetCamera(this.ui?.num("board_zoom_default") ?? 1); this.redraw();
    };
    this.bindCameraInput();

    // 로그 히스토리: log_history=1일 때만 로그 영역이 클릭을 받는다(applyUiLayout에서 pointer-events 전환).
    this.logEl.addEventListener("click", () => {
      if (this.ui?.bool("log_history")) this.showLogHistory();
    });

    const onResize = () => this.fitCanvas();
    window.addEventListener("resize", onResize);
    this.resizeOff = () => window.removeEventListener("resize", onResize);

    // 키보드 단축키 (hotkey_* 키, 빈 값=비활성)
    const onKey = (e: KeyboardEvent) => this.handleHotkey(e);
    window.addEventListener("keydown", onKey);
    this.keyOff = () => window.removeEventListener("keydown", onKey);
  }

  // ── 키보드 단축키 ──
  // 모달(팝업/VN/히스토리)이 열려 있으면 무시 — 모달 흐름은 클릭/네이티브 포커스 전용.
  private handleHotkey(e: KeyboardEvent) {
    if (!this.ui) return;
    for (const sel of [".popup-backdrop", ".vn-backdrop", ".log-history-backdrop"]) {
      const el = this.panel.querySelector(sel) as HTMLElement | null;
      if (el && el.style.display !== "none") return;
    }
    const key = e.key === " " ? "space" : e.key.toLowerCase();
    const match = (k: string) => {
      const v = this.ui!.str(k).trim().toLowerCase();
      return v !== "" && v === key;
    };
    if (match("hotkey_roll")) {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();   // 포커스된 버튼의 네이티브 스페이스 활성화와 중복 방지
      void this.onRoll();
    } else if (match("hotkey_mute")) {
      e.preventDefault();
      (this.panel.querySelector("#mute-btn") as HTMLButtonElement | null)?.click();
    } else if (match("hotkey_zoom_in")) {
      e.preventDefault();
      this.renderer?.zoomBy(1 + this.ui.num("board_zoom_step")); this.redraw();
    } else if (match("hotkey_zoom_out")) {
      e.preventDefault();
      this.renderer?.zoomBy(1 / (1 + this.ui.num("board_zoom_step"))); this.redraw();
    } else if (match("hotkey_zoom_reset")) {
      e.preventDefault();
      this.renderer?.resetCamera(this.ui.num("board_zoom_default")); this.redraw();
    }
  }

  // ── 로그 히스토리 모달 (log_history=1) ──
  // 엔진 Popup과 독립된 모달 — 이벤트 선택지 대기 Promise와 절대 엉키지 않는다.
  private showLogHistory() {
    if (this.panel.querySelector(".log-history-backdrop")) return;
    const backdrop = document.createElement("div");
    backdrop.className = "log-history-backdrop";
    const box = document.createElement("div");
    box.className = "log-history";
    const h = document.createElement("h3");
    h.textContent = tu("log_history_title", "이벤트 로그");
    const list = document.createElement("div");
    list.className = "hist-list";
    for (let i = this.logHistory.length - 1; i >= 0; i--) {   // 최신이 위
      const line = document.createElement("div");
      line.textContent = this.logHistory[i];
      list.appendChild(line);
    }
    const close = document.createElement("button");
    close.className = "btn btn-ghost";
    close.textContent = tu("popup_ok", "확인");
    close.onclick = () => backdrop.remove();
    backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
    box.append(h, list, close);
    backdrop.appendChild(box);
    this.panel.appendChild(backdrop);
  }

  // ── 보드 카메라 입력(휠 줌·드래그 팬·핀치 줌·더블클릭 리셋) — board_* 키로 on/off ──
  private bindCameraInput() {
    const cv = this.canvas;
    const zoomOn = () => !!this.ui?.bool("board_zoom");
    const panOn = () => !!this.ui?.bool("board_pan");
    const step = () => this.ui?.num("board_zoom_step") ?? 0.15;

    cv.addEventListener("wheel", (e) => {
      if (!zoomOn() || !this.renderer) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const f = e.deltaY < 0 ? 1 + step() : 1 / (1 + step());
      this.renderer.zoomBy(f, e.clientX - r.left, e.clientY - r.top);
      this.redraw();
    }, { passive: false });

    cv.addEventListener("pointerdown", (e) => {
      if (!this.renderer) return;
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [p1, p2] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev || !this.renderer) return;
      const cur = { x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, cur);
      if (this.pointers.size === 1 && panOn()) {
        this.renderer.panBy(cur.x - prev.x, cur.y - prev.y);
        this.redraw();
      } else if (this.pointers.size === 2 && zoomOn()) {
        const [p1, p2] = [...this.pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (this.pinchDist > 0 && d > 0) {
          const r = cv.getBoundingClientRect();
          this.renderer.zoomBy(d / this.pinchDist, (p1.x + p2.x) / 2 - r.left, (p1.y + p2.y) / 2 - r.top);
          this.redraw();
        }
        this.pinchDist = d;
      }
    });
    const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pinchDist = 0; };
    cv.addEventListener("pointerup", release);
    cv.addEventListener("pointercancel", release);

    cv.addEventListener("dblclick", () => {
      if (!zoomOn() || !this.renderer) return;
      this.renderer.resetCamera(this.ui?.num("board_zoom_default") ?? 1);
      this.redraw();
    });
  }

  private fitCanvas() {
    const stage = this.panel.querySelector("#stage") as HTMLDivElement;
    const dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth, h = stage.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  private redraw() {
    if (this.board && this.renderer) {
      this.renderer.fit(this.board);
      this.renderer.draw(this.board, {
        playerTileId: this.playerTileId ?? undefined,
        playerPos: this.tokenPos ?? undefined,
        playerSprite: this.data?.config.player_sprite as string | undefined,
        enemies: this.enemies.filter(e => e.alive).map(e => ({
          tileId: e.tileId,
          color: e.stun > 0 ? "#8a6a6a" : "#e8443a",   // 정지 중이면 흐린 색
          sprite: e.def.sprite,
        })),
      });
    }
  }

  private async boot(input: GameSceneData) {
    const path = input.configPath ?? "/resources/data/hero/";
    this.configPath = path;
    // 씬 인스턴스는 재사용되므로 런 상태 초기화
    this.ended = false;
    this.busy = false;   // 씬 재사용 시 박제된 busy 회복(팝업 중 이탈 등으로 finally 미도달 대비)
    this.enemies = []; this.currentEnemy = null;
    this.skipNextTurn = false;
    this.characterId = undefined;
    this.logHistory = [];
    this.thresholdLast.clear();
    this.thresholdFired.clear();
    this.rollBtn.disabled = false; delete this.rollBtn.dataset.disabled;
    try {
      const data = await loadGameData(path);
      this.data = data;
      this.itemDefs = new Map(data.items.map(it => [it.id, it]));
      // UI 설정: 코드 기본값 ← ui.csv(전역) ← config.csv(스테이지) 캐스케이드.
      // CSS 변수(포트레이트/팝업/VN/로그 규격 등) 주입 + 레이아웃(배율/토글/배치) 적용.
      this.ui = new UiSettings(getTheme().raw, data.config);
      this.ui.applyCssVars();
      this.applyUiLayout();
      this.audio.setVolumes(this.ui.num("bgm_volume"), this.ui.num("sfx_volume"));

      // 시드: 세이브가 있으면 세이브 시드, 없으면 config.
      // config 시드가 비어 있으면(랜덤 보드) 이번 런용 고정 시드를 즉석 생성한다.
      // → 매 부팅 다른 보드 + 세이브/재개 시 같은 보드 재현.
      const rawSeed = input.save?.seed ?? (data.config.seed as any);
      this.runSeed = (rawSeed === undefined || rawSeed === null || rawSeed === "")
        ? `r${Date.now()}-${Math.floor(Math.random() * 1e6)}`
        : rawSeed;
      this.rng = makeRng(this.runSeed);
      const gen = generateBoard(data.tiles, data.generation, this.rng);

      this.board = new Board(gen.tiles, data.edges);
      this.condMap = indexConditions(data.conditions);
      this.statusDefs = new Map(data.statuses.map(s => [s.id, s]));
      this.resolver = new TileEventResolver(data.tileEvents, this.condMap);
      this.renderer = new CanvasRenderer(this.ctx, this.canvas);
      this.renderer.setStyle({
        ...this.buildBoardStyle(this.ui.asRecord()),   // 보드 외형(전역 ui.csv ← 스테이지 config)
        labelMode: this.ui.str("tile_label_mode"),
        typeLabel: this.ui.bool("tile_type_label"),
      });
      this.renderer.setCameraOpts({
        zoomMin: this.ui.num("board_zoom_min"),
        zoomMax: this.ui.num("board_zoom_max"),
        fitPadding: this.ui.num("board_fit_padding"),
        cellMin: this.ui.num("board_cell_min"),
        cellMax: this.ui.num("board_cell_max"),
      });
      this.renderer.resetCamera(this.ui.num("board_zoom_default"));
      this.player = new Player(data.resources);
      this.player.setDerived(data.derived);          // 파생 스탯 규칙 등록 + 초기 계산
      this.thresholdDefs = data.thresholds;
      this.hud = new Hud(this.hudEl, (id) => this.ui?.raw(HUD_BAR_COLOR_PREFIX + id));
      this.dice = makeDice(data.config.dice as any, data.config.dice_sides as any, this.rng);
      this.popup = new Popup(this.panel);
      this.vn = new VNOverlay(this.panel, { msPerChar: () => this.ui?.num("vn_text_speed") ?? 0 });

      // 세이브 복원
      if (input.save) {
        this.playerTileId = input.save.playerTileId;
        this.turnCount = input.save.turnCount ?? 0;
        this.player?.flags.set("turn", this.turnCount);
        for (const [id, val] of Object.entries(input.save.resources)) {
          try { this.player.set(id, val); } catch {}
        }
        for (const [k, v] of Object.entries(input.save.flags)) {
          this.player.flags.set(k, v as any);
        }
        for (const [id, st] of Object.entries(input.save.statuses ?? {})) {
          this.player.statuses.set(id, { remaining: st.remaining, stacks: st.stacks });
        }
        for (const [id, c] of Object.entries(input.save.inventory ?? {})) {
          if (typeof c === "number" && c > 0) this.player.inventory.set(id, c);
        }
      } else {
        this.playerTileId = data.config.start_tile;
        this.turnCount = 0;
        this.player?.flags.set("turn", 0);
      }

      // 메타 보너스 적용 (세이브 복원이 아닌 새 런에만)
      if (!input.save && input.metaBonuses?.length) {
        for (const b of input.metaBonuses) {
          try { this.player.add(b.target, b.value); } catch {}
        }
      }

      // 이벤트 엔진
      const choicesByEvent = new Map<string, typeof data.choices>();
      for (const c of data.choices) {
        const list = choicesByEvent.get(c.event_id) ?? [];
        list.push(c); choicesByEvent.set(c.event_id, list);
      }
      this.engine = new EventEngine({
        player: this.player,
        events: new Map(data.events.map(e => [e.id, e])),
        choices: choicesByEvent,
        effects: indexEffects(data.effects),
        conditions: this.condMap,
        popup: this.popup,
        rng: this.rng,
        moveDelta: async (steps) => { await this.walkSteps(Math.abs(steps), { reverse: steps < 0 }); },
        moveTo: async (id) => { this.playerTileId = id; this.redraw(); await sleep(150); },
        skipNext: () => { this.skipNextTurn = true; },
        log: (l) => this.pushLog(l),
        applyStatus: (id, dur) => this.applyStatus(id, dur),
        clearStatus: (id) => this.player!.clearStatus(id),
        statusRemaining: (id) => this.player!.statusRemaining(id),
        defeatEnemy: () => this.defeatEnemy(),
        stunEnemy: (t) => this.stunEnemy(t),
        pushEnemy: (t) => this.pushEnemy(t),
        giveItem: (id, qty) => this.giveItem(id, qty),
        takeItem: (id, qty) => this.takeItem(id, qty),
        itemCount: (id) => this.player!.itemCount(id),
        changeTile: (targetIds, newType) => {
          if (!this.board) return;
          let changed = false;
          for (const tid of targetIds) {
            const t = this.board.tiles.get(tid);
            if (t) { t.type = newType; changed = true; }
          }
          if (changed) this.redraw();
        },
        playAudio: (id) => this.audio.play(id),
        playBgm: (id) => this.audio.playBgm(id),
        assetBase: path,
        vn: this.vn,
        assets: new Map(data.assets.map(a => [a.id, a])),
      });

      // 타일 스프라이트 미리 로드 (assets.csv id → 경로, 또는 sprite 자체가 경로)
      this.preloadSprites(data, path);

      // 오디오 에셋 등록 (kind=audio)
      for (const a of data.assets) if (a.kind === "audio") this.audio.register(a.id, this.resolveAsset(a.path, path));
      
      const bgm = data.config.bgm as string | undefined;
      if (bgm) this.audio.playBgm(data.assets.find(a => a.id === bgm) ? bgm : this.resolveAsset(bgm, this.configPath));

      // 진행도용 거리 맵 (시작 칸 기준 BFS)
      this.buildDistances(data.config.start_tile, data.config.goal_tile as string | undefined);

      // 적 설정 (enemies.csv) + 세이브 복원
      this.initEnemies(data, input.save);

      const titleEl = this.panel.querySelector("#game-title") as HTMLElement;
      titleEl.textContent = `[ 인디게임 성공기 ]`;

      // 캐릭터: characters.csv 있으면 새 런에서 선택(시작 효과 적용), 복원이면 저장된 캐릭터 사용.
      // 없으면 config.portrait/player_name으로 폴백. (HUD 렌더 전에 시작 효과가 반영되도록)
      await this.setupCharacter(data, input, path);

      this.player.recomputeDerived();   // 복원/메타/캐릭터 보정 반영
      this.primeThresholds();           // 현재 상태를 기준선으로(즉시 발동 방지)
      this.hud.render(this.player);
      this.renderStatusStrip();
      this.renderInventory();
      this.updateStatus();
      this.updateProgress();

      this.pushLog(`인디게임 성공기 시작!`);
      this.fitCanvas();
      this.startAutoSave();

      if (new URLSearchParams(location.search).has("debug")) {
        (window as any).__debug = { scene: this, board: this.board, player: this.player, engine: this.engine };
      }
    } catch (e: any) {
      console.error(e);
      this.statusEl.textContent = tu("game_load_failed", "로드 실패") + ": " + e.message;
    }
  }

  // ── 이동 ──
  private stepTo(from: Tile, to: Tile): Promise<void> {
    return new Promise(resolve => {
      if (!this.renderer) return resolve();
      const dur = Math.max(1, this.animMs()), t0 = performance.now();
      // 즉시 이동: 아주 짧은 애니메이션이거나 탭이 숨겨져 rAF가 멈춰 있을 때(행 걸림 방지).
      if (dur <= 16 || document.hidden) { this.tokenPos = null; this.redraw(); return resolve(); }
      const tick = (now: number) => {
        // 화면 좌표는 매 프레임 다시 계산 — 애니메이션 도중 줌/팬이 바뀌어도 어긋나지 않는다.
        const a = this.renderer!.tileCenter(from), b = this.renderer!.tileCenter(to);
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.tokenPos = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
        this.redraw();
        if (t < 1) requestAnimationFrame(tick);
        else { this.tokenPos = null; resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  private async walkSteps(steps: number, opts?: { reverse?: boolean }) {
    if (!this.board || !this.playerTileId) return;
    for (let i = 0; i < steps; i++) {
      const cur = this.board.get(this.playerTileId);
      const next = opts?.reverse ? this.prevTile(cur) : await this.chooseNext(cur);
      if (!next) break;
      await this.stepTo(cur, next);
      this.playerTileId = next.id;
      // 카메라 추적: 확대 중일 때 토큰을 화면 중앙에 유지(board_follow_player=1).
      if (this.ui?.bool("board_follow_player") && this.renderer && this.renderer.getZoom() > 1.01) {
        this.renderer.centerOn(next);
      }
      this.redraw();
      // 통과 접촉: 이동 중 적을 밟으면(pass/both) 즉시 해소.
      await this.passContact();
      // 스킵 불가 칸: 전진 중 닿으면 남은 이동 취소하고 정지.
      if (!opts?.reverse && next.stop) { this.pushLog(`🛑 ${next.label ?? next.id} — 멈춤`); break; }
    }
  }

  // 전진 한 칸. 분기(out-edge 2개 이상)면 팝업으로 길 선택.
  // cond_group이 걸린 길은 조건 통과 시에만 후보에 포함(조건부 길).
  private async chooseNext(cur: Tile): Promise<Tile | undefined> {
    if (!this.board) return undefined;
    const allOuts = this.board.outEdges.get(cur.id) ?? [];
    if (allOuts.length === 0) return undefined;
    const outs = allOuts.filter(e => evalConditions(e.cond_group, this.condMap, this.condCtx()));
    if (outs.length === 0) return undefined;   // 조건 미충족으로 갈 수 있는 길 없음 → 멈춤
    if (outs.length === 1) return this.board.get(outs[0].to);
    const options = outs.map((e, i) => ({ id: String(i), text: this.forkLabel(e) }));
    const picked = await this.popup!.choose(tu("fork_title", "갈림길"), tu("fork_prompt", "어느 길로 갈까?"), options, { icon: "🛤️" });
    const idx = Number(picked);
    const e = outs[Number.isNaN(idx) ? 0 : idx] ?? outs[0];
    this.pushLog(`🛤️ ${this.forkLabel(e)}`);
    return this.board.get(e.to);
  }
  private forkLabel(e: { to: string; label?: string }): string {
    const lbl = (e.label ?? "").trim();
    if (lbl === "shortcut") return tu("fork_shortcut", "지름길로 간다");
    if (lbl) return lbl;
    const dest = this.board!.get(e.to);
    return `${tu("fork_main", "큰 길로 간다")} (${dest.label ?? dest.id})`;
  }

  private prevTile(t: Tile): Tile | undefined {
    if (!this.board) return;
    const ins = this.board.inEdges.get(t.id) ?? [];
    const main = ins.find(e => !e.label) ?? ins[0];
    return main ? this.board.get(main.from) : undefined;
  }

  // ── 주사위 굴리기 ──
  private async onRoll() {
    if (!this.board || !this.dice || this.busy) return;
    this.busy = true; this.rollBtn.disabled = true; this.updateInventoryEnabled();
    try {
      // 턴 시작 틱(자원 decay·상태 효과·턴 훅). 지속 피해로 사망 가능.
      await this.startOfTurn();
      if (await this.checkEnd()) return;
      if (this.skipNextTurn) {
        this.skipNextTurn = false;
        await this.popup!.message(tu("skip_title", "턴 스킵"), tu("skip_body", "이번 턴은 쉰다."));
        this.autoSave();
        return;
      }
      this.audio.play("sfx_dice");
      this.turnCount++;
      this.player?.flags.set("turn", this.turnCount);
      const n = this.dice.roll();
      await this.animateDice(n);   // 표시 연출(dice_anim) — 결과는 이미 확정, 시드 RNG 미사용
      this.diceResultEl.textContent = `🎲 ${n}`;
      await this.walkSteps(n);
      this.updateStatus();
      this.updateProgress();
      await this.triggerArrival();
      await this.checkThresholds();
      if (await this.checkEnd()) return;
      // 플레이어 행동 후 적 이동/공격
      await this.moveEnemies();
      await this.checkThresholds();
      if (await this.checkEnd()) return;
      await this.endOfTurn();
      if (await this.checkEnd()) return;
      this.autoSave();
    } finally {
      this.busy = false;
      if (!this.rollBtn.dataset.disabled) this.rollBtn.disabled = false;
      this.updateInventoryEnabled();
    }
  }

  // 캐릭터 결정 + 적용. characters.csv가 있을 때만 동작.
  //  - 복원(save.characterId): 저장된 캐릭터로 포트레이트/이름만 복원(시작 효과는 이미 자원에 반영됨).
  //  - 새 런: 선택 팝업 → 시작 효과(start_effect_group) 1회 적용 → 포트레이트/이름 적용.
  //  - characters.csv 없음: config.portrait/player_name으로 폴백.
  private async setupCharacter(data: GameData, input: GameSceneData, base: string) {
    const chars = data.characters ?? [];
    let chosen: CharacterDef | undefined;

    if (input.save?.characterId) {
      chosen = chars.find(c => c.id === input.save!.characterId);
    } else if (!input.save && chars.length > 0) {
      const opts = chars.map(c => {
        const cName = td("characters", c.id, "name", c.name);
        const cDesc = c.desc ? " — " + td("characters", c.id, "desc", c.desc) : "";
        return { id: c.id, text: `${c.icon ?? c.portrait ?? ""} ${cName}${cDesc}`.trim() };
      });
      const picked = await this.popup!.choose(tu("char_select_title", "캐릭터 선택"), tu("char_select_prompt", "누구로 모험을 떠날까?"), opts, { icon: "🧭" });
      chosen = chars.find(c => c.id === picked) ?? chars[0];
      // 시작 효과는 새 런에서만 1회 적용(복원 시 중복 적용 방지).
      if (chosen?.start_effect_group) await this.engine!.applyEffects(chosen.start_effect_group);
      if (chosen) this.pushLog(`${chosen.icon ?? "🧑"} ${chosen.name} 선택`);
    }

    this.characterId = chosen?.id;
    const portrait = chosen?.portrait ?? (data.config.portrait as string | undefined);
    const name = chosen?.name ?? (data.config.player_name as string | undefined);
    this.applyCharacter(portrait, name, base);
  }

  // 포트레이트: 이미지 경로면 <img>, 아니면 이모지 텍스트. 이미지 로드 실패 시 이모지 폴백.
  private applyCharacter(portrait: string | undefined, name: string | undefined, base: string) {
    this.nameEl.textContent = name && name.trim() ? name : tu("char_default_name", "주인공");
    const fallback = "🙂";
    const looksImage = !!portrait && (/\.(png|jpe?g|gif|webp|svg)$/i.test(portrait) || portrait.includes("/"));
    if (portrait && looksImage) {
      const url = portrait.startsWith("http") || portrait.startsWith("/") ? portrait : base + portrait;
      this.portraitEl.textContent = "";
      const img = document.createElement("img");
      img.className = "portrait-img";
      img.src = assetUrl(url); img.alt = name ?? "portrait";
      img.onerror = () => { this.portraitEl.textContent = portrait && !looksImage ? portrait : fallback; };
      this.portraitEl.appendChild(img);
    } else {
      this.portraitEl.textContent = portrait && portrait.trim() ? portrait : fallback;
    }
  }

  // ── 스테이터스 / 턴 훅 ──
  // 상태 부여: status def에서 기본 지속/중첩 한도를 조회(override 가능). 효과(APPLY_STATUS)에서 호출.
  private applyStatus(id: string, durationOverride?: number) {
    if (!this.player) return;
    const def = this.statusDefs.get(id);
    if (!def) { this.pushLog(`상태 정의 없음: ${id}`); return; }
    const dur = durationOverride ?? def.duration;
    this.player.applyStatus(id, dur, def.max_stacks);
    this.renderStatusStrip();
  }

  // 활성 상태를 캐릭터 패널 칩으로 표시(아이콘 + 남은 턴, 중첩 시 ×N).
  private renderStatusStrip() {
    if (!this.statusStripEl || !this.player) return;
    this.statusStripEl.innerHTML = "";
    for (const [id, st] of this.player.statuses) {
      const def = this.statusDefs.get(id);
      const chip = document.createElement("span");
      chip.className = "status-chip";
      const stacks = st.stacks > 1 ? `×${st.stacks}` : "";
      chip.textContent = `${def?.icon ?? "✦"}${stacks} ${st.remaining}`;
      chip.title = `${def?.label ?? id} — ${st.remaining}턴 남음${st.stacks > 1 ? `, ${st.stacks}중첩` : ""}`;
      this.statusStripEl.appendChild(chip);
    }
  }

  // ── 인벤토리 (아이템 사용) ──
  // 아이템 이름은 i18n seam(td("items", id, "name", …))을 통과시킨다(언어팩 없으면 인라인 원문).
  private itemName(def: ItemDef): string { return td("items", def.id, "name", def.name); }

  // 효과(GIVE_ITEM/TAKE_ITEM)에서 호출. max_stack은 item def에서 조회.
  private giveItem(id: string, qty: number) {
    if (!this.player) return;
    const def = this.itemDefs.get(id);
    this.player.giveItem(id, qty, def?.max_stack ?? 0);
    this.renderInventory();
  }
  private takeItem(id: string, qty: number) {
    if (!this.player) return;
    this.player.takeItem(id, qty);
    this.renderInventory();
  }

  // 보유 아이템을 캐릭터 패널 칩으로 표시(아이콘 + 수량). 클릭하면 사용.
  private renderInventory() {
    if (!this.invStripEl || !this.player) return;
    this.invStripEl.innerHTML = "";
    for (const [id, count] of this.player.inventory) {
      if (count <= 0) continue;
      const def = this.itemDefs.get(id);
      const chip = document.createElement("button");
      chip.className = "inv-chip";
      chip.dataset.itemId = id;
      chip.innerHTML = `<span class="inv-icon">${def?.icon ?? "🎒"}</span>` +
        (count > 1 ? `<span class="inv-count">${count}</span>` : "");
      const name = def ? this.itemName(def) : id;
      const desc = def?.desc ? " — " + td("items", def.id, "desc", def.desc) : "";
      const usable = def?.use_effect_group ? "" : ` (${tu("item_unusable", "사용 불가")})`;
      chip.title = `${name}${desc}${usable}`;
      chip.onclick = () => this.useItem(id);
      this.invStripEl.appendChild(chip);
    }
    this.updateInventoryEnabled();
  }

  // 사용 가능 여부 갱신: 주사위 대기 중(!busy && !ended)이고, 사용 효과가 있고, 조건 충족 시에만 활성.
  private updateInventoryEnabled() {
    if (!this.invStripEl || !this.player) return;
    const ready = !this.busy && !this.ended;
    for (const chip of Array.from(this.invStripEl.children) as HTMLButtonElement[]) {
      const def = this.itemDefs.get(chip.dataset.itemId!);
      const ok = ready && !!def?.use_effect_group
        && evalConditions(def.cond_group, this.condMap, this.condCtx());
      chip.disabled = !ok;
    }
  }

  // 아이템 사용. 주사위 굴리기 전(턴 대기)에만 가능. 사용 효과 실행 후 소모성이면 1개 차감.
  private async useItem(id: string) {
    if (this.busy || this.ended || !this.player || !this.engine) return;
    const def = this.itemDefs.get(id);
    if (!def || this.player.itemCount(id) <= 0) return;
    if (!def.use_effect_group) return;            // 보유 전용 아이템(사용 효과 없음)
    const name = this.itemName(def);
    if (!evalConditions(def.cond_group, this.condMap, this.condCtx())) {
      await this.popup!.message(name, tu("item_cant_use", "지금은 사용할 수 없다."), { icon: def.icon });
      return;
    }
    // 사용 처리 중에는 다른 입력(주사위/다른 아이템)을 잠근다.
    this.busy = true; this.rollBtn.disabled = true; this.updateInventoryEnabled();
    try {
      this.pushLog(`${def.icon ?? "🎒"} ${name} 사용`);
      const snap = new Map(this.player.entries().map(({ def: d, value }) => [d.id, value]));
      await this.engine.applyEffects(def.use_effect_group);
      if (def.consumable) this.player.takeItem(id, 1);
      this.hud!.render(this.player);
      this.renderStatusStrip();
      this.renderInventory();
      this.updateStatus();
      // 자원 변동 강조 + 임계/종료 판정
      for (const { def: d, value } of this.player.entries()) {
        const before = snap.get(d.id);
        if (before !== undefined && value !== before) this.hud!.flash(d.id, value > before);
      }
      await this.checkThresholds();
      this.autoSave();
    } finally {
      this.busy = false;
      if (!this.rollBtn.dataset.disabled) this.rollBtn.disabled = false;
      this.updateInventoryEnabled();
    }
    await this.checkEnd();   // 사용으로 패배 조건이 갖춰졌을 수도 있음
  }

  // ── 보드 외형 (전역 ui.csv ← 스테이지 config 병합 맵 기반) ──
  // 병합 맵의 보드 외형 키 → BoardStyle 부분값(없으면 렌더러 기본 유지).
  private buildBoardStyle(cfg: Record<string, unknown>): Partial<BoardStyle> {
    const s: Partial<BoardStyle> = {};
    const str = (key: string, prop: keyof BoardStyle) => {
      const v = cfg[key]; if (typeof v === "string" && v.trim()) (s as any)[prop] = v.trim();
    };
    const num = (key: string, prop: keyof BoardStyle) => {
      const raw = cfg[key]; const n = Number(raw);
      if (raw !== undefined && raw !== "" && Number.isFinite(n)) (s as any)[prop] = n;
    };
    str("board_bg", "boardBg");
    str("edge_color", "edgeColor"); num("edge_width", "edgeWidth");
    num("tile_pad", "tilePad"); num("tile_radius", "tileRadius");
    str("tile_border", "tileBorder"); num("tile_border_width", "tileBorderWidth");
    str("locked_border", "lockedBorder");
    str("player_color", "playerColor"); str("enemy_color", "enemyColor");
    str("token_stroke", "tokenStroke"); num("token_radius", "tokenRadius");
    return s;
  }

  // ── UI 레이아웃 (UiSettings 기반) ──
  // 배율(--scale-*), 표시 토글, 패널/로그 모서리 배치를 적용한다.
  // CSS 변수 규격(포트레이트/팝업 아트 등)은 UiSettings.applyCssVars()가 담당.
  private applyUiLayout() {
    const ui = this.ui!;
    const root = document.documentElement;
    const u = ui.num("ui_scale");
    const scale = (varName: string, n: number) => root.style.setProperty(varName, String(n));
    scale("--scale-header", u);
    scale("--scale-footer", u * ui.num("footer_scale"));
    scale("--scale-char-panel", u * ui.num("char_panel_scale"));
    scale("--scale-hud", ui.num("hud_scale"));   // 패널 안쪽이라 ui_scale은 패널에서 이미 적용됨
    scale("--scale-log", u * ui.num("log_scale"));
    scale("--scale-popup", u * ui.num("popup_scale"));
    scale("--scale-vn", u * ui.num("vn_scale"));

    const show = (sel: string, on: boolean) => {
      const el = this.panel.querySelector(sel) as HTMLElement | null;
      if (el) el.style.display = on ? "" : "none";
    };
    show("#game-header", ui.bool("show_header"));
    show("#progress-wrap", ui.bool("show_progress"));
    show("#event-log", ui.bool("show_log"));
    show("#dice-result", ui.bool("show_dice_result"));
    show("#status", ui.bool("show_status"));
    show("#board-zoom-ctrl", ui.bool("board_zoom") && ui.bool("board_zoom_buttons"));

    // 캐릭터 패널 모서리(char_panel_pos: tl/tr/bl/br) — 오프셋은 --char-panel-x/y 변수
    const cp = this.panel.querySelector("#char-panel") as HTMLElement;
    const pos = ui.str("char_panel_pos");
    cp.style.top = pos[0] === "t" ? "var(--char-panel-y, 12px)" : "auto";
    cp.style.bottom = pos[0] === "b" ? "var(--char-panel-y, 12px)" : "auto";
    cp.style.left = pos[1] === "l" ? "var(--char-panel-x, 12px)" : "auto";
    cp.style.right = pos[1] === "r" ? "var(--char-panel-x, 12px)" : "auto";

    // 이벤트 로그 모서리(log_pos)
    const lp = ui.str("log_pos");
    this.logEl.style.top = lp[0] === "t" ? "10px" : "auto";
    this.logEl.style.bottom = lp[0] === "b" ? "10px" : "auto";
    this.logEl.style.left = lp[1] === "l" ? "10px" : "auto";
    this.logEl.style.right = lp[1] === "r" ? "10px" : "auto";

    // 로그 히스토리(log_history=1): 로그가 클릭을 받는다.
    // 기본(off)은 CSS pointer-events:none 그대로 — 로그 위 클릭이 보드 팬/줌으로 통과(현행 유지).
    const hist = ui.bool("log_history");
    this.logEl.style.pointerEvents = hist ? "auto" : "";
    this.logEl.style.cursor = hist ? "pointer" : "";
    this.logEl.title = hist ? tu("log_history_hint", "클릭하면 전체 로그를 봅니다") : "";
  }

  // 애니메이션 시간: anim_step_ms/enemy_step_ms를 anim_speed로 나눈 값(키 없으면 기존 220/120ms).
  private animMs(): number {
    if (!this.ui) return 220;
    return this.ui.num("anim_step_ms") / Math.max(0.25, this.ui.num("anim_speed"));
  }
  private enemyMs(): number {
    if (!this.ui) return 120;
    return this.ui.num("enemy_step_ms") / Math.max(0.25, this.ui.num("anim_speed"));
  }

  // 턴 시작: 자원 decay → 활성 상태 per-turn 효과(중첩만큼) → duration 감소/만료 → config.on_turn_start.
  // 이번 턴에 새로 건 상태는 다음 턴부터 틱한다(턴 시작 틱).
  private async startOfTurn() {
    if (!this.player || !this.engine || !this.data) return;
    for (const { def } of this.player.entries()) {
      if (def.decay) {
        const c = this.player.add(def.id, def.decay);
        if (c.delta !== 0) this.pushLog(`${def.label} ${c.delta > 0 ? "+" : ""}${c.delta} (지속)`);
      }
    }
    for (const [id, st] of [...this.player.statuses]) {
      const def = this.statusDefs.get(id);
      // v2: 매 턴 효과는 인라인(per_turn_target/amount). 중첩 수만큼 곱해 한 번에 적용.
      if (def?.per_turn_target && def.per_turn_amount && this.player.defs.has(def.per_turn_target)) {
        const c = this.player.add(def.per_turn_target, def.per_turn_amount * st.stacks);
        if (c.delta !== 0) {
          const tlabel = this.player.defs.get(def.per_turn_target)?.label ?? def.per_turn_target;
          this.pushLog(`${def.label ?? id} — ${tlabel} ${c.delta > 0 ? "+" : ""}${c.delta}`);
        }
      }
      st.remaining -= 1;
      if (st.remaining <= 0) { this.player.statuses.delete(id); this.pushLog(`${def?.label ?? id} 효과가 사라졌다`); }
    }
    await this.engine.applyEffects(this.data.config.on_turn_start as string | undefined);
    this.hud!.render(this.player);
    this.renderStatusStrip();
    await this.checkThresholds();
  }

  // 턴 끝: config.on_turn_end 훅.
  private async endOfTurn() {
    if (!this.player || !this.engine || !this.data) return;
    await this.engine.applyEffects(this.data.config.on_turn_end as string | undefined);
    this.hud!.render(this.player);
    this.renderStatusStrip();
  }

  // ── 임계 트리거 ──
  // 시작 시 현재 상태를 lastState로 굳혀, 처음부터 참인 임계가 즉시 발동하지 않게 한다.
  private primeThresholds() {
    const ctx = this.condCtx();
    for (const t of this.thresholdDefs) {
      this.thresholdLast.set(t.id, evalPredicate(t.subject, t.op, t.value, ctx));
    }
  }
  // 자원/상태 변동 후 호출. 임계 조건이 false→true로 넘는 순간만 발동(엣지). once는 런당 1회.
  private async checkThresholds() {
    if (!this.engine || this.thresholdDefs.length === 0) return;
    for (const t of this.thresholdDefs) {
      const cur = evalPredicate(t.subject, t.op, t.value, this.condCtx());
      const last = this.thresholdLast.get(t.id) ?? false;
      this.thresholdLast.set(t.id, cur);
      if (!cur || last) continue;                     // 새로 넘는 순간만
      if (t.mode === "once" && this.thresholdFired.has(t.id)) continue;
      this.thresholdFired.add(t.id);
      this.pushLog(`⚡ 임계: ${t.id}`);
      if (t.event) {
        await this.engine.run(t.event);
        this.restoreBgm();
      }
      else if (t.effect) await this.engine.applyEffects(t.effect);
      this.hud!.render(this.player!);
      this.renderStatusStrip();
    }
  }

  // ── 스프라이트/자산 ──
  private resolveAsset(p: string, base: string): string {
    return p.startsWith("/") || p.startsWith("http") ? p : base + p;
  }
  private preloadSprites(data: GameData, base: string) {
    const imgs = new Map<string, HTMLImageElement>();
    const load = (key: string, url: string) => {
      if (imgs.has(key)) return;
      const img = new Image();
      img.onload = () => this.redraw();
      img.src = assetUrl(url);
      imgs.set(key, img);
    };
    // 이미지 자산을 id로 등록 (tile_<type> 기본 스프라이트 포함)
    for (const a of data.assets) if (a.kind === "image") load(a.id, this.resolveAsset(a.path, base));
    // 타일이 직접 지정한 sprite(경로/미등록 id)도 등록
    for (const t of this.board!.tiles.values()) {
      if (t.sprite && !imgs.has(t.sprite)) load(t.sprite, this.resolveAsset(t.sprite, base));
    }
    // 마커 스프라이트(플레이어/적) — assets.id면 그 path로, 아니면 값을 경로로. 키는 원본값.
    const markerKeys = [data.config.player_sprite as string | undefined, ...data.enemies.map(e => e.sprite)]
      .filter((k): k is string => !!k);
    for (const key of markerKeys) {
      if (imgs.has(key)) continue;
      const asset = data.assets.find(a => a.id === key);
      load(key, this.resolveAsset(asset?.path ?? key, base));
    }
    this.renderer!.setSprites(imgs);
  }

  private restoreBgm() {
    if (this.ended) return;
    const bgm = this.data?.config.bgm as string | undefined;
    if (bgm) this.audio.playBgm(this.data!.assets.find(a => a.id === bgm) ? bgm : this.resolveAsset(bgm, this.configPath));
  }

  // ── 진행도 (시작 칸 기준 BFS 거리) ──
  private buildDistances(start: string, goal: string | undefined) {
    const dist = new Map<string, number>();
    if (!this.board) return;
    const q: string[] = [start]; dist.set(start, 0);
    while (q.length) {
      const id = q.shift()!; const d = dist.get(id)!;
      for (const e of this.board.outEdges.get(id) ?? []) {
        if (!dist.has(e.to)) { dist.set(e.to, d + 1); q.push(e.to); }
      }
    }
    this.distFromStart = dist;
    this.goalDist = goal && dist.has(goal) ? dist.get(goal)! : Math.max(1, ...Array.from(dist.values()));
  }
  private updateProgress() {
    const cur = this.playerTileId ? (this.distFromStart.get(this.playerTileId) ?? 0) : 0;
    const pct = Math.max(0, Math.min(1, cur / this.goalDist));
    this.progressFillEl.style.width = `${(pct * 100).toFixed(0)}%`;
    this.progressTextEl.textContent = `${Math.round(pct * 100)}%`;
  }

  // 주사위 표시 연출(dice_anim=spin): 확정된 결과를 보여주기 전 눈금을 잠깐 돌린다.
  // 연출 전용이라 Math.random 사용(시드 RNG를 소비하면 보드 재현이 깨짐). 숨김 탭이면 생략.
  private async animateDice(n: number) {
    if (!this.ui || this.ui.str("dice_anim") !== "spin" || document.hidden) return;
    const ms = this.ui.num("dice_anim_ms");
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      this.diceResultEl.textContent = `🎲 ${1 + Math.floor(Math.random() * Math.max(6, n))}`;
      await sleep(60);
    }
  }

  // ── 이벤트 로그 ──
  private pushLog(line: string) {
    if (!this.logEl) return;
    // [Event] 로그가 연속으로 중복 출력되는 것 방지
    if (line.startsWith("[Event] ") && this.logHistory.length > 0 && this.logHistory[this.logHistory.length - 1] === line) return;
    
    this.logHistory.push(line);
    if (this.logHistory.length > 500) this.logHistory.shift();   // 메모리 상한
    const div = document.createElement("div");
    div.className = "log-line";
    div.textContent = line;
    this.logEl.prepend(div);
    const maxLines = this.ui?.num("log_max_lines") ?? 10;
    while (this.logEl.childElementCount > maxLines) this.logEl.lastElementChild?.remove();
  }

  // ── 적 (enemies.csv, 다중) ──
  private initEnemies(data: GameData, save?: RunSave | null) {
    this.enemies = [];
    for (const def of data.enemies) {
      if (!this.board?.tiles.has(def.start)) continue;
      const s = save?.enemies?.[def.id];
      this.enemies.push({
        def,
        tileId: s?.tileId ?? def.start,
        stun: s?.stun ?? 0,
        alive: s?.alive ?? true,
        state: { activated: s?.activated },
      });
    }
    if (this.enemies.some(e => e.alive)) this.pushLog("⚠️ 적이 도사린다!");
  }

  // 무방향 그래프 이웃.
  private neighbors(id: string): string[] {
    if (!this.board) return [];
    const outs = (this.board.outEdges.get(id) ?? []).map(e => e.to);
    const ins = (this.board.inEdges.get(id) ?? []).map(e => e.from);
    return [...new Set([...outs, ...ins])];
  }
  // 무방향 BFS로 target에 가까워지는 첫 칸.
  private nextHopToward(from: string, target: string): string | undefined {
    if (from === target) return undefined;
    const prev = new Map<string, string>(); const seen = new Set([from]); const q = [from];
    while (q.length) {
      const id = q.shift()!;
      for (const n of this.neighbors(id)) {
        if (seen.has(n)) continue;
        seen.add(n); prev.set(n, id); q.push(n);
        if (n === target) {
          let step = n; while (prev.get(step) !== from) step = prev.get(step)!;
          return step;
        }
      }
    }
    return undefined;
  }
  // 무방향 BFS 거리(도달 불가 = Infinity).
  private distanceTo(from: string, target: string): number {
    if (from === target) return 0;
    const dist = new Map<string, number>([[from, 0]]); const q = [from];
    while (q.length) {
      const id = q.shift()!; const d = dist.get(id)!;
      for (const n of this.neighbors(id)) {
        if (dist.has(n)) continue;
        dist.set(n, d + 1);
        if (n === target) return d + 1;
        q.push(n);
      }
    }
    return Infinity;
  }

  private enemyActive(e: ActiveEnemy): boolean {
    return evalConditions(e.def.cond_group, this.condMap, this.condCtx());
  }

  // 플레이어 턴 후 모든 적 이동/공격.
  private async moveEnemies() {
    if (!this.board || !this.playerTileId) return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.stun > 0) { e.stun -= 1; this.redraw(); continue; }
      if (!this.enemyActive(e)) continue;
      const fn = getBehavior(e.def.behavior);
      if (!fn) { this.pushLog(`알 수 없는 behavior: ${e.def.behavior}`); continue; }
      for (let i = 0; i < Math.max(1, e.def.speed); i++) {
        if (!this.playerTileId) break;
        const act = fn({
          enemyTileId: e.tileId,
          playerTileId: this.playerTileId,
          vision: e.def.vision,
          rng: this.rng,
          neighbors: (id) => this.neighbors(id),
          nextHop: (a, b) => this.nextHopToward(a, b),
          distance: (a, b) => this.distanceTo(a, b),
          state: e.state,
        });
        if (act.attack) { await this.enemyHit(e); break; }   // 원거리 공격(이동 없음)
        if (!act.move) break;                                // 정지(잠복 등)
        e.tileId = act.move; this.redraw(); await sleep(this.enemyMs());
        const c = e.def.contact;
        if (e.tileId === this.playerTileId && (c === "move" || c === "both")) { await this.enemyHit(e); break; }
        if (!e.alive) break;   // 접촉 중 처치됐을 수 있음
      }
    }
  }

  // 플레이어가 이동 중 같은 칸의 적을 밟았을 때(접촉 pass/both) 처리.
  private async passContact() {
    if (!this.playerTileId) return;
    const hit = this.enemies.find(e => e.alive && e.stun <= 0 && e.tileId === this.playerTileId
      && (e.def.contact === "pass" || e.def.contact === "both") && this.enemyActive(e));
    if (hit) await this.enemyHit(hit);
  }

  // 접촉/사격 해소 — 그 적을 currentEnemy로 두고 event(보통 CHOICE) 또는 기본 피해.
  private async enemyHit(e: ActiveEnemy) {
    if (!e.alive) return;
    this.currentEnemy = e;
    const name = td("enemies", e.def.id, "label", e.def.label ?? e.def.id);
    if (e.def.event) {
      await this.engine!.run(e.def.event);
    } else {
      const dmg = Math.max(1, e.def.damage);
      this.player!.add("hp", -dmg);
      this.pushLog(`💥 ${name} — HP -${dmg}`);
      await this.popup!.message(name, `${name}에게 당했다. HP -${dmg}`, { icon: e.def.icon ?? "👹" });
    }
    this.currentEnemy = null;
    this.hud!.render(this.player!);
    this.renderStatusStrip();
  }

  // ── 적 처치 효과 (DEFEAT/STUN/PUSH_ENEMY → currentEnemy 대상) ──
  private defeatEnemy() {
    const e = this.currentEnemy;
    if (!e) return;
    e.alive = false;
    this.pushLog(`☠️ ${e.def.label ?? e.def.id} 처치`);
    this.redraw();
  }
  private stunEnemy(turns: number) {
    const e = this.currentEnemy;
    if (!e || turns <= 0) return;
    e.stun = Math.max(e.stun, turns);
    this.pushLog(`💫 ${e.def.label ?? e.def.id} ${turns}턴 정지`);
    this.redraw();
  }
  private pushEnemy(tiles: number) {
    const e = this.currentEnemy;
    if (!e || !this.playerTileId || tiles <= 0) return;
    for (let i = 0; i < tiles; i++) {
      const ns = this.neighbors(e.tileId);
      let best = e.tileId, bd = this.distanceTo(e.tileId, this.playerTileId);
      for (const n of ns) { const d = this.distanceTo(n, this.playerTileId); if (d > bd) { bd = d; best = n; } }
      if (best === e.tileId) break;
      e.tileId = best;
    }
    this.pushLog(`➡️ ${e.def.label ?? e.def.id} 밀려남`);
    this.redraw();
  }

  // ── 조건/엔딩 ──
  private condCtx() {
    const p = this.player!;
    return {
      res: (id: string) => { try { return p.get(id); } catch { return 0; } },
      flag: (k: string) => p.flags.get(k),
      status: (id: string) => p.statusRemaining(id),
      item: (id: string) => p.itemCount(id),
    };
  }
  private pickEnding(victory: boolean): EndingDef | undefined {
    if (!this.data) return undefined;
    const want = victory ? "victory" : "defeat";
    const cands = this.data.endings
      .filter(e => e.when === "any" || e.when === want)
      .sort((a, b) => b.priority - a.priority);
    const ctx = this.condCtx();
    for (const e of cands) if (evalConditions(e.cond_group, this.condMap, ctx)) return e;
    return undefined;
  }
  // 종료 판정. 종료되면 true.
  private async checkEnd(): Promise<boolean> {
    if (this.ended || !this.player || !this.data) return this.ended;
    const goalId = this.data.config.goal_tile as string | undefined;
    if (goalId && this.playerTileId === goalId) { await this.endGame(true); return true; }
    const loseGroup = this.data.config.lose_cond_group as string | undefined;
    const lost = loseGroup
      ? evalConditions(loseGroup, this.condMap, this.condCtx())
      : (this.player.defs.has("hp") ? this.player.get("hp") <= 0 : false);   // 기본: HP 0 이하 (없으면 무시)
    if (lost) { await this.endGame(false); return true; }
    return false;
  }

  // 현재 위치의 지역/타일 라벨을 푸터 상태줄에 표시.
  private updateStatus() {
    if (!this.board || !this.playerTileId) return;
    const tile = this.board.get(this.playerTileId);
    const region = REGION_LABEL[tile.region] ?? tile.region;
    let spot = tile.label ?? tile.id;
    
    // t_01 -> 1턴 변환
    if (spot.startsWith("t_")) {
      const numMatch = spot.match(/^t_0*(\d+)$/);
      if (numMatch) spot = `${numMatch[1]}턴`;
      else if (spot === "t_00") spot = "시작 지점";
      else if (spot === "t_50") spot = "목표 지점";
    }

    this.statusEl.textContent = region ? `📍 ${region} · ${spot}` : `📍 ${spot}`;
  }

  private async triggerArrival() {
    if (!this.board || !this.engine || !this.player || !this.playerTileId || !this.resolver) return;
    const tile = this.board.get(this.playerTileId);
    const snap = new Map(this.player.entries().map(({ def, value }) => [def.id, value]));

    // 이벤트 결정: 고정(event_id) 우선, 없으면 타입 풀 추첨
    const eventId = this.resolver.resolve(tile, this.player, this.rng);
    console.log(`[Arrival] ${tile.id} (${tile.type ?? "?"}) → ${eventId ?? "없음"}`);
    if (eventId) {
      if (tile.label || (tile.type && tile.type !== "empty")) {
        let lbl = tile.label ?? tile.id;
        if (lbl.startsWith("t_")) {
          const numMatch = lbl.match(/^t_0*(\d+)$/);
          if (numMatch) lbl = `${numMatch[1]}턴 도착`;
          else if (lbl === "t_00") lbl = "시작 지점";
          else if (lbl === "t_50") lbl = "목표 지점 도착";
        }
        this.pushLog(`📍 ${lbl}`);
      }

      // -- BGM 동적 재생 훅 --
      let bgmToPlay: string | undefined = undefined;
      const idStr = eventId;
      
      if (idStr.includes("best")) bgmToPlay = "sfx_happyend";
      else if (idStr.includes("normal1")) bgmToPlay = "sfx_normalend";
      else if (idStr.includes("normal2")) bgmToPlay = "sfx_zzipzzipend";
      else if (idStr.includes("bad")) bgmToPlay = "sfx_badend";
      if (tile.id === "t_42" || (tile.id === "t_49" && tile.type === "negative") || idStr.includes("ev_m_009") || idStr.includes("010_N")) {
        bgmToPlay = "sfx_badevents9";
        // 클라이맥스 진입 시 보드판 BGM도 영구 변경 (인게임 복귀 시에도 유지)
        if (this.data?.config) this.data.config.bgm = bgmToPlay;
      }
      else if (tile.type === "positive" || tile.type === "main" || idStr.includes("010_P")) bgmToPlay = "sfx_positivevent";
      else if (tile.type === "negative") bgmToPlay = "sfx_badevent";

      if (bgmToPlay) {
        this.audio.playBgm(bgmToPlay);
      }
      // ----------------------

      await this.engine.run(eventId);
      this.restoreBgm();
    }
    const changes = [...snap.entries()].map(([id, before]) => ({ id, delta: this.player!.get(id) - before }));
    this.hud!.render(this.player);
    let anyUp = false, anyDown = false;
    for (const c of changes) if (c.delta !== 0) {
      this.hud!.flash(c.id, c.delta > 0);
      const def = this.player.defs.get(c.id);
      this.pushLog(`${def?.label ?? c.id} ${c.delta > 0 ? "+" : ""}${c.delta} (→${this.player!.get(c.id)})`);
      if (c.delta > 0) anyUp = true; else anyDown = true;
    }
    if (anyDown) this.audio.play("sfx_lose");
    else if (anyUp) this.audio.play("sfx_gain");
    // 종료 판정은 onRoll에서 checkEnd로 일괄 처리
  }

  async endGame(victory: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.rollBtn.disabled = true;
    this.rollBtn.dataset.disabled = "1";
    this.updateInventoryEnabled();
    this.saveMgr.clearRun(this.slot);

    // 승리 시 스테이지 클리어 기록 (영구)
    if (victory) this.saveMgr.markCleared(this.stageId);

    // 멀티 엔딩: 승/패 조건으로 결정 (없으면 기본 엔딩)
    const ending = this.pickEnding(victory);

    // [수정] 엔딩에 연결된 VN 이벤트 실행 (endings.csv에는 event 컬럼이 없으므로 직접 맵핑)
    if (ending && this.engine) {
      let evId = ending.id;
      if (evId === "end_best") evId = "ev_best_1";
      if (evId === "end_normal1") evId = "ev_normal1_1";
      if (evId === "end_normal2") evId = "ev_normal2_1";
      if (evId === "end_bad") evId = "ev_bad_1";

      await this.engine.run(evId);
    }

    // 메타 포인트: 승리 10, 패배 3 (보드에 따라 config로 관리 가능)
    const points = victory ? 10 : 3;
    this.saveMgr.addPoints(points);

    await this.sm.go("result", {
      victory,
      turnCount: this.turnCount,
      resources: this.player ? this.player.entries() : [],
      points,
      stageId: this.stageId,
      ending: ending ? {
        id: ending.id, title: ending.title, text: ending.text, icon: ending.icon,
        image: ending.image ? this.resolveAsset(ending.image, this.configPath) : undefined,
      } : undefined,
    });
  }

  // ── 자동 저장 ──
  private autoSave() {
    if (!this.player || !this.playerTileId || !this.data) return;
    const resources: Record<string, number> = {};
    const flags: Record<string, unknown> = {};
    for (const { def, value } of this.player.entries()) resources[def.id] = value;
    for (const [k, v] of this.player.flags) flags[k] = v;
    this.saveMgr.saveRun({
      version: 1,
      stageId: this.stageId,
      seed: this.runSeed,
      playerTileId: this.playerTileId,
      resources, flags,
      turnCount: this.turnCount,
      savedAt: Date.now(),
      characterId: this.characterId,
      statuses: Object.fromEntries([...this.player.statuses.entries()]),
      enemies: Object.fromEntries(this.enemies.map(e => [e.def.id,
        { tileId: e.tileId, stun: e.stun, alive: e.alive, activated: e.state.activated }])),
      inventory: Object.fromEntries([...this.player.inventory.entries()]),
    }, this.slot);
  }

  private startAutoSave() {
    this.autoSaveInterval = window.setInterval(() => this.autoSave(), 30_000);
  }

  private stopAutoSave() {
    if (this.autoSaveInterval !== null) clearInterval(this.autoSaveInterval);
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
