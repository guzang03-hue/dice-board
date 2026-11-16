// 스테이지 CSV 폴더 + 전역(런) CSV를 읽어 GameData(도메인 타입)로 변환한다.
// v2 2레이어: 전역(stats/generation/assets/derived)은 data/ 루트에서 한 번 읽어 캐시하고,
// 스테이지(config/tiles/edges/…)는 해당 폴더에서 읽어 합친다(병합 아님 — 각자 다른 표).

import { CsvSource } from "./CsvSource";
import {
  STAGE_REQUIRED_TABLES, GLOBAL_TABLES,
  toConfig, toStats, statsToResources, statsToStatuses, toTiles, toEdges,
  toEvents, toChoices, toEffects, toGeneration, toTileEvents, toConditions, toAssets, toEndings,
  toCharacters, toDerived, toThresholds, toEnemies, toItems,
  type GameData, type StatDef, type GenerationRule, type AssetDef, type DerivedRule,
} from "./schema";

const DEFAULT_GLOBAL_PATH = "/resources/data/";

// 전역 레이어(런 단위) — 스테이지가 바뀌어도 같은 정의를 공유하므로 경로별로 캐시한다.
interface GlobalLayer {
  stats: StatDef[];
  generation: GenerationRule[];
  assets: AssetDef[];
  derived: DerivedRule[];
}
const globalCache = new Map<string, Promise<GlobalLayer>>();

export function clearGlobalCache(): void { globalCache.clear(); }

async function loadGlobalLayer(globalPath: string): Promise<GlobalLayer> {
  const cached = globalCache.get(globalPath);
  if (cached) return cached;
  const p = (async () => {
    const src = new CsvSource(globalPath);
    const raw = await src.loadAll([...GLOBAL_TABLES]);   // stats/generation/assets (필수)
    let derived: DerivedRule[] = [];
    try { derived = toDerived(await src.load("derived")); } catch { /* derived.csv 없음 — 파생 미사용 */ }
    return {
      stats: toStats(raw.stats),
      generation: toGeneration(raw.generation),
      assets: toAssets(raw.assets),
      derived,
    };
  })();
  globalCache.set(globalPath, p);
  return p;
}

export async function loadGameData(
  stagePath: string,
  globalPath: string = DEFAULT_GLOBAL_PATH,
): Promise<GameData> {
  const global = await loadGlobalLayer(globalPath);
  const src = new CsvSource(stagePath);
  const raw = await src.loadAll([...STAGE_REQUIRED_TABLES]);

  // 선택 스테이지 테이블: 없으면 빈 배열 (스테이지마다 둘 필요 없음)
  let endings: ReturnType<typeof toEndings> = [];
  try { endings = toEndings(await src.load("endings")); } catch { /* 없음 — 기본 엔딩 */ }

  let characters: ReturnType<typeof toCharacters> = [];
  try { characters = toCharacters(await src.load("characters")); } catch { /* 없음 — 캐릭터 선택 생략 */ }

  let thresholds: ReturnType<typeof toThresholds> = [];
  try { thresholds = toThresholds(await src.load("thresholds")); } catch { /* 없음 — 임계 미사용 */ }

  let enemies: ReturnType<typeof toEnemies> = [];
  try { enemies = toEnemies(await src.load("enemies")); } catch { /* 없음 — 적 미사용 */ }

  let items: ReturnType<typeof toItems> = [];
  try { items = toItems(await src.load("items")); } catch { /* 없음 — 인벤토리 미사용 */ }

  return {
    config: toConfig(raw.config),
    // 전역 stats → 자원(kind!=status) / 상태(kind=status) 뷰로 분리.
    resources: statsToResources(global.stats),
    statuses: statsToStatuses(global.stats),
    tiles: toTiles(raw.tiles),
    edges: toEdges(raw.edges),
    events: toEvents(raw.events),
    choices: toChoices(raw.choices),
    effects: toEffects(raw.effects),
    generation: global.generation,
    tileEvents: toTileEvents(raw.tile_events),
    conditions: toConditions(raw.conditions),
    assets: global.assets,
    endings,
    characters,
    derived: global.derived,
    thresholds,
    enemies,
    items,
  };
}
