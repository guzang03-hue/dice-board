import type { EdgeDef, TileDef } from "../data/schema";

// 타일 + 인접 그래프 모델.
// 라벨 ""(빈문자열)은 "주 경로"로 다룬다. next()는 라벨로 분기 선택 가능.

export interface Tile extends TileDef {}

export class Board {
  readonly tiles: Map<string, Tile>;
  readonly outEdges: Map<string, EdgeDef[]>;  // from → 나가는 엣지들
  readonly inEdges: Map<string, EdgeDef[]>;   // to → 들어오는 엣지들

  constructor(tiles: Tile[], edges: EdgeDef[]) {
    this.tiles = new Map(tiles.map(t => [t.id, t]));
    this.outEdges = new Map();
    this.inEdges = new Map();
    for (const e of edges) {
      if (!this.tiles.has(e.from)) throw new Error(`edge.from 미존재 타일: ${e.from}`);
      if (!this.tiles.has(e.to)) throw new Error(`edge.to 미존재 타일: ${e.to}`);
      (this.outEdges.get(e.from) ?? this.outEdges.set(e.from, []).get(e.from)!).push(e);
      (this.inEdges.get(e.to) ?? this.inEdges.set(e.to, []).get(e.to)!).push(e);
    }
  }

  get(id: string): Tile {
    const t = this.tiles.get(id);
    if (!t) throw new Error(`존재하지 않는 타일: ${id}`);
    return t;
  }

  // 다음 타일들. 라벨 우선순위: 정확 매칭 → 주 경로("")
  next(id: string, label: string = ""): Tile[] {
    const outs = this.outEdges.get(id) ?? [];
    const matched = outs.filter(e => (e.label ?? "") === label);
    const pool = matched.length > 0 ? matched : outs.filter(e => !e.label);
    return pool.map(e => this.get(e.to));
  }

  // 주 경로 한 칸 (분기 있을 때는 첫 후보). 분기 선택 UI는 추후 도입 여지.
  nextOne(id: string): Tile | undefined {
    const cands = this.next(id, "");
    return cands[0];
  }

  // n칸 이동 결과 경로(시작 타일 제외, 도착 타일 포함). 더 갈 수 없으면 끝까지만.
  walk(fromId: string, steps: number): Tile[] {
    const path: Tile[] = [];
    let cur = fromId;
    for (let i = 0; i < steps; i++) {
      const nxt = this.nextOne(cur);
      if (!nxt) break;
      path.push(nxt);
      cur = nxt.id;
    }
    return path;
  }

  bbox(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of this.tiles.values()) {
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.x > maxX) maxX = t.x;
      if (t.y > maxY) maxY = t.y;
    }
    return { minX, minY, maxX, maxY };
  }
}
