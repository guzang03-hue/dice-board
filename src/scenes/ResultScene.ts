import { assetUrl } from "../core/assetUrl";
import type { Scene } from "./Scene";
import type { SceneManager } from "./SceneManager";
import type { SaveManager } from "../core/SaveManager";
import type { ResourceDef } from "../data/schema";
import { td, tu } from "../core/i18n";

export interface EndingView {
  id: string;
  title: string;
  text?: string;
  icon?: string;
  image?: string;
}

export interface ResultData {
  victory: boolean;
  turnCount: number;
  resources: { def: ResourceDef; value: number }[];
  points: number;           // 이번 런에서 획득한 메타 포인트
  stageId: string;
  ending?: EndingView;      // 멀티 엔딩 (조건으로 선택됨). 없으면 기본 문구
}

export class ResultScene implements Scene {
  readonly id = "result";
  private panel!: HTMLDivElement;

  constructor(
    private sm: SceneManager,
    private saveMgr: SaveManager,
  ) {}

  async enter(raw?: unknown) {
    const data = (raw ?? {}) as ResultData;
    this.panel = this.sm.getOrCreatePanel("result");
    this.render(data);
    this.sm.showPanel("result");
  }

  async exit() {}

  private render(data: ResultData) {
    const { victory, turnCount, resources, points, ending } = data;
    this.panel.className = victory ? "" : "defeat";

    const statsHtml = resources.map(({ def, value }) =>
      `<div class="result-stat"><span>${td("resources", def.id, "label", def.label)}</span><span>${value}${def.max !== undefined ? `/${def.max}` : ""}</span></div>`
    ).join("");

    // 엔딩 아트: 이미지 우선, 없으면 아이콘/기본 이모지
    const iconFallback = victory ? "🏆" : "💀";
    const headIcon = ending?.icon ?? iconFallback;
    const headTitle = ending
      ? td("endings", ending.id, "title", ending.title)
      : tu(victory ? "result_clear" : "result_gameover", victory ? "클리어!" : "게임 오버");
    const headSub = ending
      ? td("endings", ending.id, "text", ending.text ?? "")
      : tu(victory ? "result_clear_sub" : "result_gameover_sub", victory ? "왕좌에 도달했다." : "HP가 바닥났다.");
    const artHtml = ending?.image
      ? `<img class="result-art-img" src="${assetUrl(ending.image)}" alt="${headTitle}" onerror="this.remove()" />`
      : "";

    this.panel.innerHTML = `
      <div class="result-icon">${artHtml || headIcon}</div>
      <h2 class="result-title">${headTitle}</h2>
      <p class="result-sub">${headSub}</p>
      <div class="result-stats">
        <div class="result-stat"><span>${tu("result_turns", "경과 턴")}</span><span>${turnCount}</span></div>
        ${statsHtml}
      </div>
      <div class="result-meta-gain">${tu("result_meta_gain", "✨ 메타 포인트")} +${points}pt</div>
      <div class="result-btns">
        <button class="btn" id="btn-retry">${tu("result_retry", "다시 도전")}</button>
        <button class="btn btn-ghost" id="btn-menu">${tu("result_to_menu", "메뉴로")}</button>
      </div>
    `;

    this.panel.querySelector("#btn-retry")!.addEventListener("click", () => {
      this.saveMgr.clearRun();
      this.sm.go("stage-select");
    });

    this.panel.querySelector("#btn-menu")!.addEventListener("click", () => {
      this.sm.go("menu");
    });
  }
}
