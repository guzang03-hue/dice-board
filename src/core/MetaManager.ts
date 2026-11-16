import type { MetaUpgradeDef } from "../data/schema";
import type { SaveManager } from "./SaveManager";

// 런 간 영구 업그레이드 관리.
// getBonuses()는 GameScene 부팅 시 Player에 적용될 보너스 목록 반환.

export class MetaManager {
  constructor(
    private saveMgr: SaveManager,
    private upgrades: MetaUpgradeDef[],
  ) {}

  getUpgrades(): MetaUpgradeDef[] { return this.upgrades; }

  getRank(id: string): number {
    return this.saveMgr.loadMeta().ranks[id] ?? 0;
  }

  buy(id: string): boolean {
    const def = this.upgrades.find(u => u.id === id);
    if (!def) return false;
    const result = this.saveMgr.buyUpgrade(id, def.cost, def.max_rank);
    return result !== null;
  }

  // 현재 랭크 기반 보너스 목록 (effect_kind=GAIN 전용 단순화).
  // 더 복잡한 효과는 EffectDef 레지스트리로 위임하면 됨.
  getBonuses(): { target: string; value: number }[] {
    const meta = this.saveMgr.loadMeta();
    const out: { target: string; value: number }[] = [];
    for (const def of this.upgrades) {
      const rank = meta.ranks[def.id] ?? 0;
      if (rank <= 0 || !def.target) continue;
      out.push({ target: def.target, value: def.value * rank });
    }
    return out;
  }
}
