// 적 행동 레지스트리. effects 패턴과 동일하게 kind → 함수 등록.
// 한 "스텝"마다 행동 함수가 다음 칸 이동(move) 또는 원거리 공격(attack)을 결정한다.
// 새 행동을 추가하려면 registerBehavior 한 줄.

export interface BehaviorCtx {
  enemyTileId: string;
  playerTileId: string;
  vision: number;
  rng: () => number;
  neighbors: (id: string) => string[];
  nextHop: (from: string, to: string) => string | undefined;   // BFS로 to에 가까워지는 첫 칸
  distance: (from: string, to: string) => number;              // 무방향 BFS 거리(도달불가=Infinity)
  state: { activated?: boolean };                              // 적별 지속 상태(ambush 등)
}

// 한 스텝의 결과: 이동(move) 또는 원거리 공격(attack). 둘 다 없으면 정지.
export interface BehaviorAction { move?: string; attack?: boolean; }
export type BehaviorFn = (ctx: BehaviorCtx) => BehaviorAction;

const REG = new Map<string, BehaviorFn>();
export function registerBehavior(kind: string, fn: BehaviorFn) { REG.set(kind, fn); }
export function getBehavior(kind: string): BehaviorFn | undefined { return REG.get(kind); }
export function knownBehaviors(): string[] { return [...REG.keys()]; }

// chase: BFS로 플레이어에게 접근.
registerBehavior("chase", (c) => ({ move: c.nextHop(c.enemyTileId, c.playerTileId) }));

// wander: 랜덤 이웃으로 배회.
registerBehavior("wander", (c) => {
  const ns = c.neighbors(c.enemyTileId);
  return { move: ns.length ? ns[Math.floor(c.rng() * ns.length)] : undefined };
});

// ambush: 잠복(정지)하다 플레이어가 시야에 들면 활성화 후 추적.
registerBehavior("ambush", (c) => {
  if (!c.state.activated) {
    if (c.distance(c.enemyTileId, c.playerTileId) <= c.vision) c.state.activated = true;
    else return {};   // 아직 잠복
  }
  return { move: c.nextHop(c.enemyTileId, c.playerTileId) };
});

// turret: 정지 포탑. 시야 안이면 원거리 공격, 아니면 가만히.
registerBehavior("turret", (c) => {
  return c.distance(c.enemyTileId, c.playerTileId) <= c.vision ? { attack: true } : {};
});

// ranged: 시야 안이면 멈춰서 원거리 공격, 밖이면 chase로 접근.
registerBehavior("ranged", (c) => {
  return c.distance(c.enemyTileId, c.playerTileId) <= c.vision
    ? { attack: true }
    : { move: c.nextHop(c.enemyTileId, c.playerTileId) };
});
