// Dice Board — 부트스트랩.
// SceneManager에 모든 씬을 등록하고 메뉴로 진입.

import { SceneManager } from "./scenes/SceneManager";
import { MenuScene } from "./scenes/MenuScene";
import { StageSelectScene } from "./scenes/StageSelectScene";
import { GameScene } from "./scenes/GameScene";
import { ResultScene } from "./scenes/ResultScene";
import { MetaScene } from "./scenes/MetaScene";
import { SaveManager } from "./core/SaveManager";
import { MetaManager } from "./core/MetaManager";
import { CsvSource } from "./data/CsvSource";
import { toStages, toMetaUpgrades } from "./data/schema";
import { loadAndApplyTheme, getTheme } from "./core/theme";
import { loadLanguage } from "./core/i18n";

async function boot() {
  // 공유 서비스
  const saveMgr = new SaveManager();
  const sm = new SceneManager("scene-root");

  // 전역 UI 테마(ui.csv) 적용 — 메뉴 진입 전(색/폰트/배경/이름). 없으면 기본값.
  await loadAndApplyTheme("/resources/data/");

  // 언어팩: ui.csv의 lang이 ko가 아니면 strings_<lang>.json을 올려 번역 적용(없으면 인라인 한국어).
  const lang = (getTheme().raw.lang ?? "").trim().toLowerCase();
  if (lang && lang !== "ko") await loadLanguage(lang, "/resources/data/");

  // 글로벌 CSV에서 stages + meta 로드
  const src = new CsvSource("/resources/data/");
  const [stageRows, metaRows] = await Promise.all([
    src.load("stages"),
    src.load("meta"),
  ]);
  const stages = toStages(stageRows);
  const metaUpgrades = toMetaUpgrades(metaRows);
  const metaMgr = new MetaManager(saveMgr, metaUpgrades);

  // 씬 등록
  sm.register(new MenuScene(sm, saveMgr, stages));
  sm.register(new StageSelectScene(sm, saveMgr, metaMgr, stages));
  sm.register(new GameScene(sm, saveMgr));
  sm.register(new ResultScene(sm, saveMgr));
  sm.register(new MetaScene(sm, saveMgr, metaMgr));

  // 시작
  await sm.go("menu");
}

boot().catch(e => {
  document.body.innerHTML = `<div style="color:#f87171;padding:24px;font-family:monospace;">
    <b>부팅 실패</b><br>${e.message}
  </div>`;
  console.error(e);
});
