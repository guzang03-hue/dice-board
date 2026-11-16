import { assetUrl } from "../core/assetUrl";
// VN(비주얼 노벨) 렌더 레이어 (M27).
// 화면 ~90%를 덮는 풀스크린 오버레이. 좌측에 배경+캐릭터 스프라이트, 우측 상단에 대사 창,
// 그 아래 선택지를 둔다(첨부 레이아웃). 기존 Popup과 같은 계약(present → Promise<선택지 id>)이라
// EventEngine이 vn 필드가 있는 이벤트만 이 오버레이로, 나머지는 기존 Popup으로 보내면 된다.
//
// 이 컴포넌트는 데이터 스키마에 의존하지 않는다 — view-model(VNView)만 받는다.
// "어떤 CSV 컬럼이 background/sprite를 공급하는가"는 배선 단계(스키마 확정 후)에서 정한다.

import { tu } from "../core/i18n";
import type { ChoiceOption } from "./Popup";

export type SpritePos = "left" | "center" | "right";

export interface VNSprite {
  image?: string;   // 해석된 이미지 URL(우선)
  icon?: string;    // 이모지 폴백(이미지 없거나 로드 실패 시)
  pos?: SpritePos;  // 좌/중/우 배치(기본 center)
}

export interface VNView {
  background?: string;       // 이미지 URL 또는 CSS 색(빈=기본 어두운 배경)
  sprites?: VNSprite[];      // 등장 캐릭터 복수 지원
  speaker?: string;          // 대사 창 화자명(선택)
  title?: string;            // 제목(선택)
  text?: string;             // 대사 본문
  choices: ChoiceOption[];   // 선택지(대사만이면 [{id:"ok", text:"계속"}] 한 개)
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
function looksImage(s: string): boolean {
  return IMAGE_RE.test(s) || s.startsWith("/") || s.startsWith("http") || s.includes("/");
}

export interface VNOptions {
  // 타자기 효과: 글자당 ms(매 표시 시점에 조회 — vn_text_speed 키). 0 이하=즉시(기존 동작).
  msPerChar?: () => number;
}

export class VNOverlay {
  private root: HTMLDivElement;
  private typeTimer: number | null = null;
  private isTyping: boolean = false;
  private finishTypingFn: (() => void) | null = null;
  private currentKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement = document.body, private opts?: VNOptions) {
    this.root = document.createElement("div");
    this.root.className = "vn-backdrop";
    this.root.style.display = "none";
    container.appendChild(this.root);
  }

  // 대사(선택지 없는 진행) — "계속" 한 개로 처리.
  say(view: Omit<VNView, "choices">): Promise<void> {
    return this.present({ ...view, choices: [{ id: "ok", text: tu("vn_continue", "계속") }] }).then(() => undefined);
  }

  // VN 화면을 띄우고 선택지 id를 반환.
  present(view: VNView): Promise<string> {
    return new Promise(resolve => this.show(view, id => resolve(id)));
  }

  private show(view: VNView, onPick: (id: string) => void) {
    this.root.innerHTML = "";
    const frame = el("div", "vn-frame");

    // ── 좌: 비주얼 스테이지 ──
    const visual = el("div", "vn-visual");
    if (view.background) {
      if (looksImage(view.background)) {
        const bg = document.createElement("img");
        bg.className = "vn-bg"; bg.src = assetUrl(view.background); bg.alt = "";
        bg.onerror = () => bg.remove();   // 로드 실패 시 기본 배경색만
        visual.appendChild(bg);
      } else {
        visual.style.background = view.background;   // CSS 색
      }
    }
    if (view.sprites && view.sprites.length > 0) {
      for (const sprite of view.sprites) {
        if (!sprite.image && !sprite.icon) continue;
        const pos = sprite.pos ?? "center";
        if (sprite.image && looksImage(sprite.image)) {
          const img = document.createElement("img");
          img.className = `vn-sprite-img pos-${pos}`; img.src = assetUrl(sprite.image); img.alt = view.speaker ?? "";
          // 이미지 로드 실패 → 이모지 폴백으로 교체
          img.onerror = () => { img.remove(); if (sprite.icon) visual.appendChild(emojiSprite(sprite.icon, pos)); };
          visual.appendChild(img);
        } else if (sprite.icon) {
          visual.appendChild(emojiSprite(sprite.icon, pos));
        }
      }
    }
    frame.appendChild(visual);

    // ── 우: 텍스트 창 + 선택지 ──
    const side = el("div", "vn-side");
    const box = el("div", "vn-textbox");
    // 화자 이름(speaker) 생략 요청으로 주석 처리
    // if (view.speaker) box.appendChild(elText("div", "vn-speaker", view.speaker));
    if (view.title) box.appendChild(elText("div", "vn-title", view.title));
    if (view.text) {
      const txt = elText("div", "vn-text", view.text);
      box.appendChild(txt);
      const ms = this.opts?.msPerChar?.() ?? 0;
      // 타자기 효과: 숨김 탭(setInterval 지연)이면 즉시 출력. 텍스트 창 클릭=전체 출력.
      if (ms > 0 && !document.hidden) this.typewrite(txt, box, view.text, ms);
    }
    side.appendChild(box);

    const choices = el("div", "vn-choices");
    const choiceButtons: HTMLButtonElement[] = [];
    
    const cleanup = () => {
      if (this.currentKeyHandler) {
        window.removeEventListener("keydown", this.currentKeyHandler);
        this.currentKeyHandler = null;
      }
      this.hide();
    };

    for (let i = 0; i < view.choices.length; i++) {
      const c = view.choices[i];
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = c.disabled && c.disabledReason ? `${c.text}  (${c.disabledReason})` : c.text;
      
      // 다중 선택지일 경우 숫자 표기
      if (view.choices.length > 1 && !c.disabled) {
        btn.textContent = `${i + 1}. ${btn.textContent}`;
      }
      
      btn.disabled = !!c.disabled;
      btn.onclick = () => { cleanup(); onPick(c.id); };
      choices.appendChild(btn);
      choiceButtons.push(btn);
    }
    side.appendChild(choices);
    frame.appendChild(side);

    this.root.appendChild(frame);
    this.root.style.display = "flex";

    // 키보드 이벤트 핸들러 등록
    this.currentKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return; // 꾹 누르고 있을 때의 연속 입력 무시
      
      if (e.code === "Space") {
        e.preventDefault(); // 스페이스바 스크롤 방지
        
        // 타이핑 중이면 스킵
        if (this.isTyping && this.finishTypingFn) {
          this.finishTypingFn();
          return;
        }
        
        // 선택지가 하나일 때만 스페이스바로 다음 진행
        if (view.choices.length === 1) {
          const btn = choiceButtons[0];
          if (!btn.disabled) btn.click();
        }
      } else if (view.choices.length > 1) {
        // 숫자키 1~9로 선택지 고르기
        const match = e.code.match(/^Digit([1-9])$/) || e.code.match(/^Numpad([1-9])$/);
        if (match) {
          e.preventDefault();
          const idx = parseInt(match[1], 10) - 1;
          if (idx < view.choices.length) {
            const btn = choiceButtons[idx];
            if (!btn.disabled) btn.click();
          }
        }
      }
    };
    window.addEventListener("keydown", this.currentKeyHandler);
  }

  // 글자를 점진 출력. 이모지 안전하게 코드포인트 단위([...text])로 자른다.
  private typewrite(elm: HTMLElement, clickArea: HTMLElement, text: string, msPerChar: number) {
    this.stopTypewrite();
    const chars = [...text];
    let i = 0;
    elm.textContent = "";
    this.isTyping = true;
    
    const finish = () => { 
      this.stopTypewrite(); 
      elm.textContent = text; 
      this.isTyping = false; 
    };
    this.finishTypingFn = finish;
    
    this.typeTimer = window.setInterval(() => {
      i++;
      elm.textContent = chars.slice(0, i).join("");
      if (i >= chars.length) finish();
    }, msPerChar);
    clickArea.addEventListener("click", finish, { once: true });
  }
  private stopTypewrite() {
    if (this.typeTimer !== null) { clearInterval(this.typeTimer); this.typeTimer = null; }
    this.isTyping = false;
    this.finishTypingFn = null;
  }

  private hide() { this.stopTypewrite(); this.root.style.display = "none"; this.root.innerHTML = ""; }
  destroy() { this.stopTypewrite(); this.root.remove(); }
}

function el(tag: string, cls: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement; e.className = cls; return e;
}
function elText(tag: string, cls: string, text: string): HTMLElement {
  const e = document.createElement(tag); e.className = cls; e.textContent = text; return e;
}
function emojiSprite(icon: string, pos: SpritePos): HTMLElement {
  const s = document.createElement("span"); s.className = `vn-sprite-emoji pos-${pos}`; s.textContent = icon; return s;
}
