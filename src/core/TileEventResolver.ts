// 타일 도착 시 이벤트를 결정하는 리졸버.
//
// 우선순위:
//   1. tile.event_id가 있으면 → 그 이벤트를 그대로 반환 (사전 배치 고정)
//   2. 없으면 tile.type → tile_events.csv 풀에서 조건+가중치 추첨
//   3. 풀이 없거나 모든 행이 조건 미충족이면 → undefined (이벤트 없음)
//
// condition 평가는 Condition.evaluate() 사용 — 안전한 미니 DSL.

import type { ConditionDef, TileEventDef } from "../data/schema";
import type { Tile } from "./Board";
import type { Player } from "./Player";
import { evalConditions } from "./Condition";
import { weightedPick } from "./Rng";

export class TileEventResolver {
  // tile_type → 해당 행 목록
  private byType: Map<string, TileEventDef[]>;

  constructor(defs: TileEventDef[], private conditions: Map<string, ConditionDef[]> = new Map()) {
    this.byType = new Map();
    for (const d of defs) {
      const arr = this.byType.get(d.tile_type) ?? [];
      arr.push(d);
      this.byType.set(d.tile_type, arr);
    }
  }

  // 도착한 tile과 현재 player 상태를 받아 실행할 event_id를 반환.
  resolve(tile: Tile, player: Player, rng: () => number): string | undefined {
    // 1. 고정 배치
    if (tile.event_id) return tile.event_id;

    // 2. 타입 풀 조회
    if (!tile.type || tile.type === "empty") return undefined;
    const pool = this.byType.get(tile.type);
    if (!pool || pool.length === 0) return undefined;

    // 3. 조건 필터
    const condCtx = {
      res: (id: string) => { try { return player.get(id); } catch { return 0; } },
      flag: (k: string) => player.flags.get(k),
    };
    const eligible = pool.filter(d =>
      !player.flags.get("seen_" + d.event_id) &&
      evalConditions(d.cond_group, this.conditions, condCtx)
    );
    if (eligible.length === 0) return undefined;

    // 4. 가중치 추첨
    const picked = weightedPick(eligible, rng);
    return picked?.event_id;
  }
}
