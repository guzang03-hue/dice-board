import { assetUrl } from "./assetUrl";
// 전역 UI 테마 — ui.csv(key/value) 하나로 외형을 데이터 주도로 바꾸는 수단.
// 색/폰트/간격은 :root CSS 변수로 주입하고(기존 var(--accent) 등이 전역 적용),
// 시작화면 이름/태그라인은 콘텐츠로 보관해 MenuScene이 읽는다.
// 코드 수정 없이 /resources/data/ui.csv만 고치면 된다. 파일이 없으면 전부 기본값.

import { CsvSource } from "../data/CsvSource";

export interface Theme {
  app_name: string;
  app_tagline?: string;
  raw: Record<string, string>;   // 원본 키/값(확장 키 직접 참조용)
}

let current: Theme = { app_name: "Dice Board", raw: {} };
export function getTheme(): Theme { return current; }

// ui.csv 키 → CSS 변수. 색 토큰은 index.html :root와 같은 이름이라 덮어쓰면 전역 반영된다.
const VAR_KEYS: Record<string, string> = {
  accent: "--accent", accent_dim: "--accent-dim",
  bg: "--bg", card: "--card", border: "--border", text: "--text", muted: "--muted",
  font_family: "--font-family",
  menu_bg: "--menu-bg",         // 시작화면 배경 색/그라데이션(이미지 레이어 아래에 깔림)
  ui_radius: "--ui-radius",     // 버튼 등 모서리 반경(레이아웃 간격 예시 토큰)
};

// 이미지 키 → CSS 변수. 값은 이미지 "경로"(또는 url(...)/none)만 적으면 cover로 깔린다.
// 배경은 씬별로 교체 가능, 버튼은 background-image로 스킨 적용.
const IMAGE_KEYS: Record<string, string> = {
  menu_bg_image: "--menu-bg-image",       // 시작화면 배경 이미지(교체 핵심)
  stage_bg_image: "--stage-bg-image",     // 스테이지 선택 화면
  result_bg_image: "--result-bg-image",   // 결과 화면
  meta_bg_image: "--meta-bg-image",       // 업그레이드 화면
  btn_image: "--btn-image",               // 버튼 배경 이미지(스킨)
};

// 경로/값을 CSS background-image 레이어 값으로. 빈=none, 이미 url()/none/gradient면 그대로, 그 외=경로로 보고 url() 감쌈.
function asImage(v: string | undefined): string {
  const s = assetUrl(v?.trim());
  if (!s) return "none";
  if (s === "none" || s.startsWith("url(") || s.includes("gradient(")) return s;
  return `url("${s}")`;
}

// key/value 맵을 받아 CSS 변수 적용 + 콘텐츠(app_name 등) 보관.
export function applyThemeMap(map: Record<string, string>): void {
  const root = document.documentElement;
  for (const [k, varName] of Object.entries(VAR_KEYS)) {
    const v = map[k]?.trim();
    if (v) root.style.setProperty(varName, v);
  }
  // 이미지 키: 경로만 적으면 url()로 감싸 CSS 변수에 주입(빈 키는 건드리지 않아 기본 none 유지).
  for (const [k, varName] of Object.entries(IMAGE_KEYS)) {
    if (map[k]?.trim()) root.style.setProperty(varName, asImage(map[k]));
  }
  current = {
    app_name: map.app_name?.trim() || "Dice Board",
    app_tagline: map.app_tagline?.trim() || undefined,
    raw: map,
  };
}

// 전역 ui.csv를 읽어 적용(없으면 기본 테마 유지). main.ts 부팅에서 메뉴 진입 전 호출.
export async function loadAndApplyTheme(globalPath = "/resources/data/"): Promise<void> {
  try {
    const rows = await new CsvSource(globalPath).load("ui");
    const map: Record<string, string> = {};
    for (const r of rows as Array<Record<string, string>>) if (r.key) map[r.key] = r.value ?? "";
    applyThemeMap(map);
  } catch {
    /* ui.csv 없음 — index.html :root 기본값으로 동작 */
  }
}
