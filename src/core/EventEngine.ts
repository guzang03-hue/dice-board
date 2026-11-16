import type { AssetDef, ChoiceDef, ConditionDef, EffectDef, EventDef } from "../data/schema";
import type { Player } from "./Player";
import type { Popup } from "../ui/Popup";
import type { VNOverlay, VNView } from "../ui/VNOverlay";
import { runEffect, type EffectCtx } from "../effects/effects";
import { evalConditions } from "./Condition";
import { td, tu } from "./i18n";

// 이벤트 처리. 도착 타일이 가진 event_id를 받아 실행.
// 결과로 추가 이동/스킵 같은 부수효과는 EffectCtx 콜백으로 호출자에게 위임.

export interface EngineDeps {
  player: Player;
  events: Map<string, EventDef>;
  choices: Map<string, ChoiceDef[]>;     // event_id → choices
  effects: Map<string, EffectDef[]>;     // group → seq 정렬된 효과 행들
  conditions: Map<string, ConditionDef[]>; // group → 술어 행들(AND)
  popup: Popup;
  rng: () => number;
  moveDelta: (steps: number) => Promise<void>;
  moveTo: (tileId: string) => Promise<void>;
  skipNext: () => void;
  log: (line: string) => void;
  applyStatus: (id: string, duration?: number) => void;   // 상태 부여(기본 지속은 게임이 def에서 조회)
  clearStatus: (id: string) => void;
  statusRemaining: (id: string) => number;                // 조건 status.<id> 평가용
  defeatEnemy: () => void;                 // 현재 적 처치/정지/밀어내기 (접촉 이벤트 컨텍스트)
  stunEnemy(turns: number): void;
  pushEnemy(tiles: number): void;
  giveItem(id: string, qty: number): void;
  takeItem(id: string, qty: number): void;
  itemCount(id: string): number;
  changeTile(targetIds: string[], newType: string): void;
  playAudio?: (id: string) => void;        // 사운드 재생
  playBgm?: (id: string) => void;          // BGM 재생
  assetBase?: string;                     // 이벤트 image 경로 해석용 베이스(스테이지 폴더)
  vn?: VNOverlay;                         // VN 렌더 오버레이(M27). 이벤트에 VN 필드가 있으면 이걸로 표시
  assets?: Map<string, AssetDef>;         // id → 자산(VN sprite/background 해석용)
}

export class EventEngine {
  constructor(private deps: EngineDeps) {}

  // 이벤트 체인 깊이(연속 선택지/RUN_EVENT). 순환·폭주 방지용 가드.
  private chainDepth = 0;
  private static readonly MAX_CHAIN = 32;

  private ctx(): EffectCtx {
    const { player, effects, popup, log, moveDelta, moveTo, skipNext, applyStatus, clearStatus } = this.deps;
    return {
      player,
      effects,
      moveDelta,
      moveTo,
      message: (text) => popup.message(tu("popup_notice", "알림"), this.fill(text)),
      skipNext,
      log,
      runEvent: (id) => this.run(id),   // RUN_EVENT 효과 → 이벤트 체인
      applyStatus,
      clearStatus,
      defeatEnemy: this.deps.defeatEnemy,
      stunEnemy: this.deps.stunEnemy,
      pushEnemy: this.deps.pushEnemy,
      giveItem: this.deps.giveItem,
      takeItem: this.deps.takeItem,
      changeTile: this.deps.changeTile,
      playAudio: this.deps.playAudio,
      playBgm: this.deps.playBgm,
    };
  }

  // 효과 그룹을 엔진 컨텍스트로 직접 실행(캐릭터 시작 효과 등 이벤트 밖에서 쓰는 진입점).
  async applyEffects(group: string | undefined): Promise<void> {
    if (!group) return;
    await runEffect(group, this.ctx());
  }

  private condCtx() {
    const p = this.deps.player;
    return {
      res: (id: string) => p.get(id),
      flag: (k: string) => p.flags.get(k),
      status: (id: string) => this.deps.statusRemaining(id),
      item: (id: string) => this.deps.itemCount(id),
    };
  }

  // ── 텍스트 치환 ──
  // 표시 직전에 {토큰}을 현재 값으로 바꾼다. 표 텍스트(title/text/선택지/MSG)에 쓴다.
  //   {hp}          자원/파생 스탯 현재 값        {hp.max} {hp.min}  스탯 한계값
  //   {flag.x}      플래그 값                     {status.x}         상태 남은 턴(없으면 0)
  //   {item.x}      아이템 보유 수
  // 모르는 토큰은 그대로 남긴다(작성자가 오타를 화면에서 바로 보게) — 번역 텍스트에도 동일 적용.
  private fill(s: string): string {
    if (!s || !s.includes("{")) return s;
    const p = this.deps.player;
    return s.replace(/\{([a-zA-Z0-9_.]+)\}/g, (token, key: string) => {
      try {
        if (key.startsWith("flag.")) {
          const v = p.flags.get(key.slice(5));
          return v === undefined ? token : String(v);
        }
        if (key.startsWith("status.")) return String(this.deps.statusRemaining(key.slice(7)));
        if (key.startsWith("item.")) return String(this.deps.itemCount(key.slice(5)));
        const [id, prop] = key.split(".");
        const def = p.defs.get(id);
        if (!def) return token;
        if (prop === "max") return def.max !== undefined ? String(def.max) : token;
        if (prop === "min") return def.min !== undefined ? String(def.min) : token;
        if (prop) return token;   // 알 수 없는 속성
        return String(p.get(id));
      } catch {
        return token;
      }
    });
  }

  // eventId를 실행. 없으면 noop.
  async run(eventId: string | undefined): Promise<void> {
    if (!eventId) return;
    if (this.chainDepth >= EventEngine.MAX_CHAIN) {
      this.deps.log(`⛔ 이벤트 체인 한도 초과 — '${eventId}' 중단`);
      return;
    }
    const ev = this.deps.events.get(eventId);
    if (!ev) { this.deps.log(`이벤트 없음: ${eventId}`); return; }

    // 조건 평가
    if (!evalConditions(ev.cond_group, this.deps.conditions, this.condCtx())) {
      this.deps.log(`이벤트 ${eventId}: 조건 불충족 (${ev.cond_group})`);
      return;
    }
    // 확률 평가
    const prob = ev.probability ?? 1;
    if (prob < 1 && this.deps.rng() > prob) {
      this.deps.log(`이벤트 ${eventId}: 확률 미발동 (${prob})`);
      return;
    }

    this.chainDepth++;
    try {
      await this.handle(ev);
    } finally {
      this.chainDepth--;
    }
  }

  // 이벤트의 아트(이모지/이미지)를 팝업용으로 해석.
  // image가 /나 http로 시작하면 절대 경로로 그대로, 아니면 스테이지 폴더 기준 상대경로.
  private art(ev: EventDef): { icon?: string; image?: string } | undefined {
    if (!ev.icon && !ev.image) return undefined;
    const base = this.deps.assetBase ?? "";
    let image: string | undefined;
    if (ev.image) {
      const abs = ev.image.startsWith("/") || ev.image.startsWith("http");
      image = abs ? ev.image : base + ev.image;
    }
    return { icon: ev.icon, image };
  }

  // VN 필드(background/sprite)가 있으면 VNView를 만든다(없으면 null → 기존 팝업).
  // sprite/background의 assets.id는 경로로, 아니면 색/경로 그대로 해석한다.
  private buildVN(ev: EventDef, title: string, text: string): VNView | null {
    if (!this.deps.vn || (!ev.background && !ev.sprite1 && !ev.sprite2 && !ev.sprite3)) return null;
    const base = this.deps.assetBase ?? "";
    const assets = this.deps.assets;
    const resolve = (p: string) => (p.startsWith("/") || p.startsWith("http") ? p : base + p);

    let background: string | undefined;
    if (ev.background) {
      const a = assets?.get(ev.background);
      background = a?.path ? resolve(a.path) : ev.background;
    }
    let sprites: VNView["sprites"] = [];
    let speaker = ev.speaker;
    for (const id of [ev.sprite1, ev.sprite2, ev.sprite3]) {
      if (!id) continue;
      const a = assets?.get(id);
      sprites.push({ image: a?.path ? resolve(a.path) : undefined, icon: ev.icon, pos: (a?.pos as any) ?? "center" });
      if (!speaker) speaker = a?.speaker;
    }
    return { background, sprites, speaker, title: title === ev.id ? undefined : title, text, choices: [] };
  }

  private toVNView(ev: EventDef): VNView | null {
    const title = this.fill(td("events", ev.id, "title", ev.title ?? ev.id));
    const text = this.fill(td("events", ev.id, "text", ev.text ?? ""));
    return this.buildVN(ev, title, text);
  }

  private async handle(ev: EventDef): Promise<void> {
    if (this.deps.log) this.deps.log(`[Event] ${ev.title ?? ev.id}`);
    
    // -- BGM 즉각 전환 (스크립트 전에 동적 실행) --
    let bgmToPlay: string | undefined = undefined;
    const idStr = ev.id;
    if (idStr.includes("best")) bgmToPlay = "sfx_happyend";
    else if (idStr.includes("normal1")) bgmToPlay = "sfx_normalend";
    else if (idStr.includes("normal2")) bgmToPlay = "sfx_zzipzzipend";
    else if (idStr.includes("bad")) bgmToPlay = "sfx_badend";
    else if (idStr.includes("ev_m_009") || idStr.includes("010_N")) bgmToPlay = "sfx_badevents9";
    else if (idStr.includes("010_P")) bgmToPlay = "sfx_positivevent";
    
    if (bgmToPlay && this.deps.playBgm) {
      this.deps.playBgm(bgmToPlay);
    }
    // ----------------------------------------

    this.deps.player.flags.set("seen_" + ev.id, true);
    const title = this.fill(td("events", ev.id, "title", ev.title ?? ev.id));
    const text = this.fill(td("events", ev.id, "text", ev.text ?? ""));
    const art = this.art(ev);
    const ctx = this.ctx();
    const vn = this.toVNView(ev);

    switch (ev.type) {
      case "NONE":
        return;
      case "EFFECT": {
        if (text) { if (vn) await this.deps.vn!.say(vn); else await this.deps.popup.message(title, text, art); }
        if (ev.payload) await runEffect(ev.payload, ctx);
        
        // EFFECT 타입이어도 choices.csv에 next_event가 있다면 연계
        const list = (this.deps.choices.get(ev.id) ?? []);
        if (list.length > 0) {
          const def = list[0];
          if (def?.result_effect_id) await runEffect(def.result_effect_id, ctx);
          if (def?.next_event) await this.run(def.next_event);
        }
        return;
      }
      case "MOVE": {
        // payload 형식: "move:-2" 같은 단축. 또는 effect id로도 가능.
        if (ev.payload?.startsWith("move:")) {
          const n = Number(ev.payload.slice(5));
          if (text) { if (vn) await this.deps.vn!.say(vn); else await this.deps.popup.message(title, text, art); }
          await this.deps.moveDelta(n);
        } else if (ev.payload) {
          await runEffect(ev.payload, ctx);
        }
        return;
      }
      case "CHOICE": {
        if (ev.payload) await runEffect(ev.payload, ctx);
        const list = (this.deps.choices.get(ev.id) ?? []);
        const cc = this.condCtx();
        const options = list.map(c => {
          const ok = evalConditions(c.cond_group, this.deps.conditions, cc);
          const text = this.fill(td("choices", `${ev.id}_${c.choice_id}`, "text", c.text));
          return { id: c.choice_id, text, disabled: !ok, disabledReason: ok ? undefined : tu("choice_locked", "조건 미충족") };
        });
        if (options.length === 0) {
          if (text) { if (vn) await this.deps.vn!.say(vn); else await this.deps.popup.message(title, text, art); }
          return;
        }
        // 모든 선택지가 조건 미충족이면 빠져나갈 수 없으므로 무효과 탈출 선택지 추가.
        if (options.every(o => o.disabled)) {
          options.push({ id: "__leave__", text: tu("choice_leave", "지나간다"), disabled: false, disabledReason: undefined });
        }
        const picked = vn
          ? await this.deps.vn!.present({ ...vn, choices: options })
          : await this.deps.popup.choose(title, text, options, art);
        const def = list.find(c => c.choice_id === picked);
        if (def?.result_effect_id) await runEffect(def.result_effect_id, ctx);
        // 연속 선택지: 선택 후 이어지는 이벤트가 있으면 체인 실행(CHOICE면 또 이어짐).
        if (def?.next_event) await this.run(def.next_event);
        return;
      }
      default:
        this.deps.log(`미지원 이벤트 타입: ${ev.type}`);
    }
  }
}
