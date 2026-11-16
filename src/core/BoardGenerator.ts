import type { GenerationRule, TileDef } from "../data/schema";
import { weightedPick } from "./Rng";

// 빈 타일 채우기. tiles.csv의 type이 비고 locked=0인 칸만 대상.
// generation.csv를 region별로 묶고, 가중치 추첨 → tile_type 결정.
//
// ★ event_id는 더 이상 여기서 배치하지 않는다.
//   실제 이벤트는 도착 시점에 tile_events.csv 풀에서 추첨된다. (TileEventResolver)
//   tiles.csv에 직접 event_id가 있는 칸(사전 배치)은 그대로 보존.

export interface GenerationResult {
  filled: number;
  tiles: TileDef[];
}

export function generateBoard(
  tiles: TileDef[],
  rules: GenerationRule[],
  rng: () => number,
): GenerationResult {
  const byRegion = new Map<string, GenerationRule[]>();
  for (const r of rules) {
    const arr = byRegion.get(r.region) ?? [];
    arr.push(r); byRegion.set(r.region, arr);
  }
  const fallback = byRegion.get("default") ?? [];

  let filled = 0;
  const out: TileDef[] = tiles.map(t => {
    if (t.locked || (t.type && t.type !== "")) return t;   // 사전 배치 보존
    const pool = byRegion.get(t.region) ?? fallback;
    if (pool.length === 0) return t;
    const picked = weightedPick(pool, rng);
    if (!picked) return t;
    filled++;
    // event_id는 건드리지 않음 — TileEventResolver가 런타임에 결정
    return { ...t, type: picked.tile_type };
  });

  return { filled, tiles: out };
}
