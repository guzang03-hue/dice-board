import type { Scene } from "./Scene";
import type { SceneManager } from "./SceneManager";
import type { SaveManager } from "../core/SaveManager";
import type { MetaManager } from "../core/MetaManager";
import { td, tu } from "../core/i18n";

import { globalAudio } from "../core/globalAudio";

export class MetaScene implements Scene {
  readonly id = "meta";
  private panel!: HTMLDivElement;

  constructor(
    private sm: SceneManager,
    private saveMgr: SaveManager,
    private metaMgr: MetaManager,
  ) {}

  async enter() {
    globalAudio.playBgm("/resources/audio/sfx_outgame.mp3");
    this.panel = this.sm.getOrCreatePanel("meta");
    this.render();
    this.sm.showPanel("meta");
  }

  async exit() {}

  private render() {
    const meta = this.saveMgr.loadMeta();
    const upgrades = this.metaMgr.getUpgrades();

    const cardsHtml = upgrades.map(u => {
      const rank = meta.ranks[u.id] ?? 0;
      const maxed = rank >= u.max_rank;
      const canAfford = meta.points >= u.cost;
      const label = td("meta", u.id, "label", u.label);
      const desc = td("meta", u.id, "description", u.description);
      return `
        <div class="upgrade-card">
          <h4>${label}</h4>
          <p>${desc}</p>
          <span class="upgrade-rank">${tu("meta_rank", "랭크")} ${rank} / ${u.max_rank}</span>
          ${maxed
            ? `<span class="upgrade-cost" style="color:#7be38a;">${tu("meta_maxed", "✓ 최대 랭크")}</span>`
            : `<span class="upgrade-cost">${tu("meta_cost", "비용")}: ${u.cost}pt (${tu("meta_have", "보유")}: ${meta.points}pt)</span>
               <button class="btn ${canAfford ? "" : "btn-ghost"}" data-id="${u.id}" ${canAfford ? "" : "disabled"}>
                 ${tu("meta_buy", "업그레이드")} +${u.value}
               </button>`
          }
        </div>
      `;
    }).join("");

    this.panel.innerHTML = `
      <div class="meta-header">
        <h2 class="scene-heading">${tu("meta_heading", "영구 업그레이드")}</h2>
        <span class="meta-points-badge">✨ ${meta.points}pt</span>
      </div>
      <p style="color:var(--muted);font-size:13px;margin:0;">${tu("meta_explain", "런 클리어/실패 시 메타 포인트를 얻어 영구 강화를 구매할 수 있습니다.")}</p>
      <div class="upgrade-grid">${cardsHtml}</div>
      <button class="btn btn-ghost" id="btn-back" style="margin-top:auto;">← ${tu("common_to_menu", "메뉴로")}</button>
    `;

    for (const btn of Array.from(this.panel.querySelectorAll("[data-id]")) as HTMLButtonElement[]) {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id!;
        if (this.metaMgr.buy(id)) this.render();  // 성공 시 재렌더
      });
    }

    this.panel.querySelector("#btn-back")!.addEventListener("click", () => this.sm.go("menu"));
  }
}
