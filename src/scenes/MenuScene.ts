import type { Scene } from "./Scene";
import type { SceneManager } from "./SceneManager";
import type { SaveManager } from "../core/SaveManager";
import type { StageDef } from "../data/schema";
import { td, tu } from "../core/i18n";
import { getTheme } from "../core/theme";

import { globalAudio } from "../core/globalAudio";

export class MenuScene implements Scene {
  readonly id = "menu";
  private panel!: HTMLDivElement;

  constructor(
    private sm: SceneManager,
    private saveMgr: SaveManager,
    private stages: StageDef[],
  ) {}

  async enter() {
    globalAudio.playBgm("/resources/audio/sfx_outgame.mp3");
    this.panel = this.sm.getOrCreatePanel("menu");
    this.render();
    this.sm.showPanel("menu");
  }

  async exit() {}

  private render() {
    const meta = this.saveMgr.loadMeta();
    const runs = this.saveMgr.listRuns();

    const slotsHtml = runs.map(s => {
      const stage = this.stages.find(st => st.id === s.stageId);
      const d = new Date(s.savedAt);
      let stageName = stage ? td("stages", stage.id, "name", stage.name) : s.stageId;
      if (stageName === "test") stageName = "인디게임 성공기";
      return `
        <button class="save-slot" data-slot="${s.slot ?? 0}">
          <span class="slot-name">${stage?.icon ?? "💾"} ${stageName}</span>
          <span class="slot-meta">${tu("menu_slot", "슬롯")} ${(s.slot ?? 0) + 1} · ${tu("menu_turn", "턴")} ${s.turnCount} · ${d.toLocaleDateString()}</span>
        </button>`;
    }).join("");

    const theme = getTheme();   // ui.csv에서 온 앱 이름/태그라인(없으면 기본값)
    // ui.csv 값이 인라인 기본, tu()를 통과시켜 번역(UI_app_name/UI_app_tagline)도 가능하게 한다.
    this.panel.innerHTML = `
      <div class="menu-title">${tu("app_name", theme.app_name)}</div>
      <p class="menu-subtitle">${tu("app_tagline", theme.app_tagline ?? "데이터 주도형 주사위 보드게임")}</p>
      <div class="menu-btns">
        <button class="btn" id="btn-new">${tu("menu_new", "새 게임")}</button>
        <button class="btn btn-ghost" id="btn-reset" style="color:#ff8a80;">${tu("menu_reset", "데이터 초기화")} 🗑️</button>
      </div>
      ${runs.length ? `<div class="save-slots"><div class="save-slots-title">${tu("menu_continue", "이어하기")}</div>${slotsHtml}</div>` : ""}
    `;

    this.panel.querySelector("#btn-new")!.addEventListener("click", () => {
      // 새 게임은 스테이지 선택 없이 바로 첫 번째 스테이지로 진입
      if (this.stages.length === 0) return;
      const stage = this.stages[0];
      const slot = this.saveMgr.firstEmptySlot();
      this.sm.go("game", {
        stageId: stage.id,
        configPath: stage.config_path,
        slot: slot
      });
    });

    for (const el of Array.from(this.panel.querySelectorAll(".save-slot"))) {
      el.addEventListener("click", () => {
        const slot = Number((el as HTMLElement).dataset.slot);
        const save = this.saveMgr.loadRun(slot);
        if (!save) { this.render(); return; }
        const stage = this.stages.find(s => s.id === save.stageId);
        this.sm.go("game", {
          stageId: save.stageId,
          configPath: stage?.config_path ?? "/resources/data/hero/",
          slot,
          save,
        });
      });
    }

    this.panel.querySelector("#btn-reset")!.addEventListener("click", async () => {
      const popup = new (await import("../ui/Popup")).Popup(this.panel);
      const picked = await popup.choose(
        "데이터 초기화",
        "정말 모든 게임 내역(해금, 저장 데이터, 포인트)을 완전히 지우시겠습니까? 이 작업은 되돌릴 수 없습니다.",
        [{ id: "ok", text: "초기화" }, { id: "cancel", text: "취소" }]
      );
      popup.destroy();
      if (picked === "ok") {
        localStorage.clear();
        location.reload();
      }
    });
  }
}
