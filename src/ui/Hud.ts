import type { Player } from "../core/Player";
import { td } from "../core/i18n";

// 자원 아이콘 키워드 → 이모지. resources.csv의 icon 필드가 이미 이모지면 그대로 사용.
const ICON_EMOJI: Record<string, string> = {
  heart: "❤️", hp: "❤️", coin: "🪙", gold: "🪙", torch: "🔥",
  mana: "🔮", magic: "🔮", shield: "🛡️", star: "⭐", key: "🗝️",
};

function iconFor(raw?: string): string {
  if (!raw) return "•";
  // 이미 이모지(ASCII 영문/숫자가 아님)면 그대로
  if (!/^[a-zA-Z0-9_]+$/.test(raw)) return raw;
  return ICON_EMOJI[raw.toLowerCase()] ?? "•";
}

// HUD: 자원을 아이콘 + 게이지 바로 표시. 변경 시 짧은 강조.
// colorFor: 스탯별 게이지 색 조회(테이블 hud_bar_color.<stat_id> 키). 없으면 id 휴리스틱(barColor) 폴백.
export class Hud {
  constructor(private el: HTMLElement, private colorFor?: (id: string) => string | undefined) {}

  render(player: Player) {
    this.el.innerHTML = "";
    for (const { def, value } of player.entries()) {
      // 표시 제어: visible=false 또는 display=hidden이면 추적만 하고 숨김.
      if (def.visible === false || def.display === "hidden") continue;
      // 표시 모드: 명시(display) 우선, 없으면 자동(bool→flag, max有→bar, 그 외→counter).
      const mode = def.display || (def.type === "bool" ? "flag" : (def.max !== undefined ? "bar" : "counter"));

      const row = document.createElement("div");
      // 모드 클래스는 res-disp-* 로 네임스페이스(게이지 요소 .res-bar와 충돌 방지).
      row.className = `res-row res-disp-${mode}`;
      row.dataset.resId = def.id;

      const icon = document.createElement("span");
      icon.className = "res-icon";
      icon.textContent = iconFor(def.icon);

      const body = document.createElement("div");
      body.className = "res-body";
      const top = document.createElement("div");
      top.className = "res-top";
      const label = td("resources", def.id, "label", def.label);

      if (mode === "flag") {
        // bool/보유 상태: 값이 양수면 보유(✓), 아니면 미보유(—).
        const on = value > 0;
        row.classList.toggle("res-off", !on);
        top.innerHTML = `<span class="res-label">${label}</span><span class="res-val">${on ? "✓" : "—"}</span>`;
        body.appendChild(top);
      } else if (mode === "counter") {
        // 숫자만(골드류): 게이지 없이 값만. max는 무의미할 때가 많아 생략.
        top.innerHTML = `<span class="res-label">${label}</span><span class="res-val">${value}</span>`;
        body.appendChild(top);
      } else {
        // bar(기본 게이지): 기존 표현 — 값/최대 + 채움 바.
        const max = def.max !== undefined ? `/${def.max}` : "";
        top.innerHTML = `<span class="res-label">${label}</span><span class="res-val">${value}${max}</span>`;
        const bar = document.createElement("div");
        bar.className = "res-bar";
        const fill = document.createElement("div");
        fill.className = "res-fill";
        if (def.max !== undefined && def.max > 0) {
          const min = def.min ?? 0;
          const pct = Math.max(0, Math.min(1, (value - min) / (def.max - min)));
          fill.style.width = `${Math.round(pct * 100)}%`;
        } else {
          fill.style.width = "100%";
        }
        fill.style.background = this.colorFor?.(def.id)?.trim() || barColor(def.id);
        bar.appendChild(fill);
        body.appendChild(top);
        body.appendChild(bar);
      }

      row.appendChild(icon);
      row.appendChild(body);
      this.el.appendChild(row);
    }
  }

  flash(resId: string, positive: boolean) {
    const row = this.el.querySelector(`[data-res-id="${resId}"]`) as HTMLElement | null;
    if (!row) return;
    row.classList.remove("res-flash-pos", "res-flash-neg");
    // 강제 리플로우로 애니메이션 재시작
    void row.offsetWidth;
    row.classList.add(positive ? "res-flash-pos" : "res-flash-neg");
    setTimeout(() => row.classList.remove("res-flash-pos", "res-flash-neg"), 500);
  }
}

function barColor(id: string): string {
  const k = id.toLowerCase();
  if (k.includes("hp") || k.includes("heart") || k.includes("health")) return "#e8556b";
  if (k.includes("gold") || k.includes("coin")) return "#f6c948";
  if (k.includes("torch") || k.includes("mana") || k.includes("magic")) return "#9a7bff";
  return "#5a9cf7";
}
