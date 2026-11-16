import type { Scene } from "./Scene";

// DOM 기반 씬 관리자.
// 각 씬은 #scene-root 아래의 div로 관리. 전환 시 fade 트랜지션.

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private current: Scene | null = null;
  private root: HTMLElement;
  private transitioning = false;

  constructor(rootId = "scene-root") {
    this.root = document.getElementById(rootId)!;
    if (!this.root) throw new Error(`#${rootId} 요소 없음`);
  }

  register(scene: Scene) {
    this.scenes.set(scene.id, scene);
  }

  async go(id: string, data?: unknown) {
    if (this.transitioning) return;
    const next = this.scenes.get(id);
    if (!next) throw new Error(`씬 없음: ${id}`);
    this.transitioning = true;
    try {
      if (this.current) {
        this.root.style.opacity = "0";
        await delay(200);
        await this.current.exit();
        this.hideAll();
      }
      this.current = next;
      // enter()는 buildDOM()+showPanel()을 동기로 먼저 그린 뒤
      // 캐릭터 선택 같은 팝업을 await할 수 있다. 그 await 중에도 화면이 보여야
      // 하므로 opacity를 enter() *이전*에 올려 페이드인시킨다. (BUG-1)
      this.root.style.opacity = "1";
      await next.enter(data);
    } finally {
      this.transitioning = false;
    }
  }

  private hideAll() {
    for (const el of Array.from(this.root.children) as HTMLElement[]) {
      el.style.display = "none";
    }
  }

  // 씬이 필요한 div를 요청하면 root 아래에 만들어 줌
  getOrCreatePanel(id: string): HTMLDivElement {
    let el = this.root.querySelector(`#panel-${id}`) as HTMLDivElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = `panel-${id}`;
      el.style.cssText = "display:none;width:100%;height:100%;position:absolute;inset:0;";
      this.root.appendChild(el);
    }
    return el;
  }

  showPanel(id: string) {
    this.hideAll();
    const el = this.root.querySelector(`#panel-${id}`) as HTMLElement | null;
    if (el) el.style.display = "flex";
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
