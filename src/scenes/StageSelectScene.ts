import type { Scene } from "./Scene";
import type { SceneManager } from "./SceneManager";
import type { SaveManager } from "../core/SaveManager";
import type { StageDef } from "../data/schema";
import type { MetaManager } from "../core/MetaManager";
import { td, tu } from "../core/i18n";

import { globalAudio } from "../core/globalAudio";

export class StageSelectScene implements Scene {
  readonly id = "stage-select";
  private panel!: HTMLDivElement;

  constructor(
    private sm: SceneManager,
    private saveMgr: SaveManager,
    private metaMgr: MetaManager,
    private stages: StageDef[],
  ) {}

  async enter() {
    globalAudio.playBgm("/resources/audio/sfx_outgame.mp3");
    this.panel = this.sm.getOrCreatePanel("stage-select");
    this.render();
    this.sm.showPanel("stage-select");
  }

  async exit() {}

  private render() {
    const meta = this.saveMgr.loadMeta();
    const unlocked = new Set(meta.unlockedStages);
    const cleared = new Set(meta.clearedStages);

    const cardsHtml = this.stages.map(s => {
      const isUnlocked = unlocked.has(s.id) || s.unlock_cost === 0;
      const isCleared = cleared.has(s.id);
      const canAfford = meta.points >= s.unlock_cost;
      const name = td("stages", s.id, "name", s.name);
      const desc = td("stages", s.id, "description", s.description ?? "");
      return `
        <div class="stage-card ${isUnlocked ? "" : "locked"}" data-id="${s.id}">
          ${isCleared ? `<span class="clear-badge">${tu("stage_cleared", "✓ 클리어")}</span>` : ""}
          <h3>${s.icon ? s.icon + " " : ""}${name}</h3>
          <p>${desc}</p>
          ${isUnlocked ? "" : `<span class="lock-label ${canAfford ? "affordable" : ""}">🔒 ${s.unlock_cost}pt ${canAfford ? tu("stage_unlock_click", "— 클릭하여 해금") : tu("stage_unlock_need", "필요")}</span>`}
        </div>
      `;
    }).join("");

    this.panel.innerHTML = `
      <h2 class="scene-heading">${tu("stageselect_heading", "스테이지 선택")} <span class="scene-points">✨ ${meta.points}pt</span></h2>
      <div class="stage-grid">${cardsHtml}</div>
      <button class="btn btn-ghost" id="btn-back" style="margin-top:auto;">← ${tu("common_to_menu", "메뉴로")}</button>
    `;

    // 해금된 카드 → 플레이 시작
    for (const el of Array.from(this.panel.querySelectorAll(".stage-card:not(.locked)"))) {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.id!;
        const stage = this.stages.find(s => s.id === id)!;
        const bonuses = this.metaMgr.getBonuses();
        this.sm.go("game", {
          stageId: stage.id,
          configPath: stage.config_path,
          slot: this.saveMgr.firstEmptySlot(),
          metaBonuses: bonuses,
        });
      });
    }

    // 잠긴 카드 → 포인트로 해금 시도
    for (const el of Array.from(this.panel.querySelectorAll(".stage-card.locked"))) {
      el.addEventListener("click", async () => {
        const id = (el as HTMLElement).dataset.id!;
        const stage = this.stages.find(s => s.id === id)!;
        const popup = new (await import("../ui/Popup")).Popup(this.panel);
        const sName = td("stages", stage.id, "name", stage.name);
        if (meta.points < stage.unlock_cost) {
          await popup.message(tu("stage_need_points", "포인트 부족"), `${sName} 해금에 ${stage.unlock_cost}pt가 필요합니다. (보유 ${meta.points}pt)`);
          popup.destroy();
          return;
        }
        const picked = await popup.choose(
          tu("stage_unlock_title", "스테이지 해금"),
          `${stage.unlock_cost}pt를 사용해 '${sName}'을(를) 해금할까요? (보유 ${meta.points}pt)`,
          [{ id: "ok", text: tu("stage_unlock_ok", "해금") }, { id: "cancel", text: tu("common_cancel", "취소") }],
        );
        popup.destroy();
        if (picked !== "ok") return;
        if (this.saveMgr.tryUnlock(stage.id, stage.unlock_cost)) {
          this.render();  // 갱신된 포인트/해금 상태 반영
        }
      });
    }

    this.panel.querySelector("#btn-back")!.addEventListener("click", () => this.sm.go("menu"));
  }
}
