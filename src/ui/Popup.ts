// 단순 DOM 모달. 특정 컨테이너(씬 패널) 안에 표시.
import { tu } from "../core/i18n";

export interface ChoiceOption {
  id: string; text: string; disabled?: boolean; disabledReason?: string;
}

// 이벤트 아트. image(URL) 우선, 로드 실패 시 icon(이모지)로 폴백.
export interface PopupArt {
  icon?: string;
  image?: string;
}

export class Popup {
  private root: HTMLDivElement;

  constructor(container: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.className = "popup-backdrop";
    this.root.style.display = "none";
    container.appendChild(this.root);
  }

  message(title: string, body: string, art?: PopupArt): Promise<void> {
    return new Promise(resolve => {
      this.show(title, body, [{ id: "ok", text: tu("popup_ok", "확인") }], () => resolve(), art);
    });
  }

  choose(title: string, body: string, choices: ChoiceOption[], art?: PopupArt): Promise<string> {
    return new Promise(resolve => {
      this.show(title, body, choices, id => resolve(id), art);
    });
  }

  private show(title: string, body: string, choices: ChoiceOption[], onPick: (id: string) => void, art?: PopupArt) {
    this.root.innerHTML = "";
    const box = document.createElement("div"); box.className = "popup";

    // 아트 영역: 이모지 폴백을 깔고, 이미지가 있으면 위에 얹되 로드 실패 시 숨김.
    if (art && (art.icon || art.image)) {
      const artBox = document.createElement("div"); artBox.className = "popup-art";
      if (art.icon) {
        const em = document.createElement("span"); em.className = "popup-art-icon";
        em.textContent = art.icon; artBox.appendChild(em);
      }
      if (art.image) {
        const img = document.createElement("img"); img.className = "popup-art-img";
        img.src = art.image; img.alt = title;
        // 로드 실패하면 이미지 제거 → 이모지 폴백만 남김
        img.onerror = () => img.remove();
        artBox.appendChild(img);
      }
      box.appendChild(artBox);
    }

    const h = document.createElement("h2"); h.textContent = title; box.appendChild(h);
    if (body) { const p = document.createElement("p"); p.textContent = body; box.appendChild(p); }
    const list = document.createElement("div"); list.className = "choices";
    for (const c of choices) {
      const btn = document.createElement("button");
      btn.textContent = c.disabled && c.disabledReason ? `${c.text}  (${c.disabledReason})` : c.text;
      btn.disabled = !!c.disabled;
      btn.onclick = () => { this.hide(); onPick(c.id); };
      list.appendChild(btn);
    }
    box.appendChild(list); this.root.appendChild(box);
    this.root.style.display = "flex";
  }

  private hide() { this.root.style.display = "none"; this.root.innerHTML = ""; }

  destroy() { this.root.remove(); }
}
