import type { EffectDef } from "../data/schema";
import type { Player } from "../core/Player";
import { td } from "../core/i18n";

// 효과 실행 컨텍스트. 게임에서 주입.
export interface EffectCtx {
  player: Player;
  effects: Map<string, EffectDef[]>;   // group → seq 정렬된 효과 행들
  // 이동/메시지 같은 부수효과는 게임이 처리.
  moveDelta(steps: number): Promise<void>;
  moveTo(tileId: string): Promise<void>;
  message(text: string): Promise<void>;
  skipNext(): void;
  log: (line: string) => void;
  runEvent?(eventId: string): Promise<void>;   // RUN_EVENT용 — EventEngine이 주입(이벤트 체인)
  applyStatus?(id: string, duration?: number): void;  // APPLY_STATUS — 게임이 주입(상태 def 조회)
  clearStatus?(id: string): void;                     // CLEAR_STATUS
  // 적 처치 효과 — 접촉 이벤트가 발동한 "현재 적"을 대상으로 동작(GameScene 주입).
  defeatEnemy?(): void;
  stunEnemy?(turns: number): void;
  pushEnemy?(tiles: number): void;
  // 인벤토리 — item def의 max_stack을 아는 게임이 주입.
  giveItem?(id: string, qty: number): void;
  takeItem?(id: string, qty: number): void;
  changeTile?(targetIds: string[], newType: string): void; // 타일 타입 동적 변경
  playAudio?(id: string): void;
  playBgm?(id: string): void;
}

export type EffectHandler = (eff: EffectDef, ctx: EffectCtx) => Promise<void> | void;

const HANDLERS = new Map<string, EffectHandler>();

export function registerEffect(kind: string, h: EffectHandler) { HANDLERS.set(kind, h); }
export function getEffectHandler(kind: string): EffectHandler | undefined { return HANDLERS.get(kind); }

// 효과 그룹 실행 — group에 속한 행을 seq 순서대로 실행.
export async function runEffect(group: string, ctx: EffectCtx): Promise<void> {
  const rows = ctx.effects.get(group);
  if (!rows || rows.length === 0) { ctx.log(`효과 없음: ${group}`); return; }
  for (const eff of rows) {   // indexEffects가 seq 오름차순 정렬해 둠
    const h = HANDLERS.get(eff.kind);
    if (!h) { ctx.log(`핸들러 없음: ${eff.kind}`); continue; }
    await h(eff, ctx);
  }
}

// ---------- 기본 효과 등록 ----------
registerEffect("GAIN", (eff, ctx) => {
  if (!eff.target) return;
  const v = Number(eff.value ?? 0);
  ctx.player.add(eff.target, +v);
});
registerEffect("LOSE", (eff, ctx) => {
  if (!eff.target) return;
  const v = Number(eff.value ?? 0);
  ctx.player.add(eff.target, -v);
});
registerEffect("SET", (eff, ctx) => {
  if (!eff.target) return;
  const v = Number(eff.value ?? 0);
  ctx.player.set(eff.target, v);
});
registerEffect("MOVE_DELTA", async (eff, ctx) => {
  const v = Number(eff.value ?? 0);
  ctx.log(`이동 ${v >= 0 ? "+" : ""}${v}`);
  await ctx.moveDelta(v);
});
registerEffect("MOVE_TO", async (eff, ctx) => {
  if (typeof eff.value !== "string") return;
  ctx.log(`이동 → ${eff.value}`);
  await ctx.moveTo(eff.value);
});
registerEffect("SKIP_TURN", (_eff, ctx) => {
  ctx.skipNext();
  ctx.log("다음 턴 스킵");
});
registerEffect("SET_FLAG", (eff, ctx) => {
  if (!eff.target) return;
  ctx.player.flags.set(eff.target, eff.value as any ?? 1);
  ctx.log(`flag.${eff.target} = ${eff.value ?? 1}`);
});
// 다른 이벤트를 이어서 실행(이벤트 체인). 대상 events.id는 target(우선) 또는 value.
registerEffect("RUN_EVENT", async (eff, ctx) => {
  const id = (eff.target && eff.target.trim()) || (typeof eff.value === "string" ? eff.value.trim() : "");
  if (!id) { ctx.log("RUN_EVENT: 이벤트 id 없음"); return; }
  if (!ctx.runEvent) { ctx.log(`RUN_EVENT: 실행기 미연결 (${id})`); return; }
  ctx.log(`▶ 이벤트 실행: ${id}`);
  await ctx.runEvent(id);
});
registerEffect("MSG", async (eff, ctx) => {
  const raw = typeof eff.value === "string" ? eff.value : String(eff.value ?? "");
  await ctx.message(td("effects", eff.id, "value", raw));
});
// 지속 상태 부여. target=status id, value=지속 턴 override(없으면 status def의 기본 duration).
registerEffect("APPLY_STATUS", (eff, ctx) => {
  if (!eff.target) return;
  const dur = eff.value === "" || eff.value === undefined ? undefined : Number(eff.value);
  ctx.applyStatus?.(eff.target, Number.isNaN(dur as number) ? undefined : dur);
  ctx.log(`상태 부여: ${eff.target}${dur !== undefined ? ` (${dur}턴)` : ""}`);
});
registerEffect("CLEAR_STATUS", (eff, ctx) => {
  if (!eff.target) return;
  ctx.clearStatus?.(eff.target);
  ctx.log(`상태 해제: ${eff.target}`);
});
// 인벤토리: 아이템 지급/회수. target=item id, value=수량(기본 1).
registerEffect("GIVE_ITEM", (eff, ctx) => {
  if (!eff.target) return;
  const qty = Math.abs(Number(eff.value ?? 1)) || 1;
  ctx.giveItem?.(eff.target, qty);
  ctx.log(`아이템 +${qty}: ${eff.target}`);
});
registerEffect("TAKE_ITEM", (eff, ctx) => {
  if (!eff.target) return;
  const qty = Math.abs(Number(eff.value ?? 1)) || 1;
  ctx.takeItem?.(eff.target, qty);
  ctx.log(`아이템 -${qty}: ${eff.target}`);
});
// 현재 적(접촉 이벤트를 발동시킨 적)을 처치/정지/밀어내기.
registerEffect("DEFEAT_ENEMY", (_eff, ctx) => { ctx.defeatEnemy?.(); });
registerEffect("STUN_ENEMY", (eff, ctx) => { ctx.stunEnemy?.(Number(eff.value ?? 1)); });
registerEffect("PUSH_ENEMY", (eff, ctx) => { ctx.pushEnemy?.(Number(eff.value ?? 1)); });

// ---------- 동적 타일 변경 효과 ----------
registerEffect("CHANGE_TILE", (eff, ctx) => {
  if (!eff.target || !eff.value || !ctx.changeTile) return;
  const newType = String(eff.value);
  let targets: string[] = [];
  
  // 범위 구문 파싱 (예: t_43-t_48)
  if (eff.target.includes("-")) {
    const [start, end] = eff.target.split("-");
    const sMatch = start.match(/\d+/);
    const eMatch = end.match(/\d+/);
    if (sMatch && eMatch) {
      const sNum = parseInt(sMatch[0], 10);
      const eNum = parseInt(eMatch[0], 10);
      for (let i = sNum; i <= eNum; i++) {
        targets.push(`t_${i.toString().padStart(2, "0")}`);
      }
    } else {
      targets.push(eff.target);
    }
  } else {
    // 쉼표 구분 리스트 파싱 (예: t_43,t_44)
    targets = eff.target.split(",").map(s => s.trim());
  }
  
  ctx.changeTile(targets, newType);
  ctx.log(`타일 변경: ${targets.join(",")} → ${newType}`);
});
registerEffect('PLAY_AUDIO', (eff, ctx) => { if (eff.value) ctx.playAudio?.(String(eff.value)); });
registerEffect('PLAY_BGM', (eff, ctx) => { 
  ctx.log(`[BGM] 이펙트 페이로드 재생 무시 (동적 엔진이 처리함): ${eff.value}`);
  // if (eff.value) ctx.playBgm?.(String(eff.value)); 
});
