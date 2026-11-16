# 적 AI 행동 스크립트 가이드

적의 **로직은 스크립트, 배치와 수치는 표**로 나뉩니다. "어떻게 움직이는가"(추적·잠복·포탑 같은 상태 패턴)는 [src/core/behaviors.ts](../src/core/behaviors.ts)에 코드로 등록하고, "어디에 몇 마리, 얼마나 세게"는 `enemies.csv`로 적습니다. 복잡한 상태 머신은 코드가 편하고, 레벨 배치는 표가 편하기 때문이에요. 이 문서는 그 코드 쪽 — 행동 스크립트를 만들고 고치는 법을 다룹니다. (표 쪽 칸 설명은 [GUIDE.md](GUIDE.md) §4.9와 워크북 `_안내` 시트 참고.)

## 1. 엔진이 행동을 부르는 방식

플레이어 턴이 끝나면 엔진([GameScene.ts](../src/scenes/GameScene.ts)의 `moveEnemies`)이 살아있는 적을 하나씩 깨워요. 적 하나당 이런 순서입니다:

1. **기절 검사** — `stun > 0`이면 1 깎고 이번 턴은 쉼.
2. **활성 검사** — `cond_group`이 있으면 평가. 거짓이면 이번 턴은 행동 안 함.
3. **행동 스크립트 호출** — `behavior` 칸의 이름으로 등록된 함수를 찾아, **`speed`번 반복**해서 부릅니다(턴당 행동 횟수). 매 호출마다 함수는 셋 중 하나를 답해요:
   - `{ move: "타일id" }` — 그 칸으로 한 칸 이동. 이동 후 플레이어와 같은 칸이고 `contact`가 `move`/`both`면 접촉 발동(그 턴 행동 종료).
   - `{ attack: true }` — 제자리 원거리 공격(접촉과 같은 해소: `event` 실행 또는 기본 `damage` 피해). 발동 후 그 턴 행동 종료.
   - `{}` — 정지(잠복 등). 그 턴 행동 종료.

접촉/공격의 해소는 스크립트 밖의 일입니다 — `event`가 있으면 그 이벤트(보통 CHOICE 전투)를, 없으면 `damage`만큼 HP를 깎아요. 스크립트는 **"이동할까, 쏠까, 가만히 있을까"만 결정**합니다.

## 2. 스크립트의 모양

행동 함수는 `BehaviorCtx`를 받아 `BehaviorAction`을 돌려주는 순수한 한 스텝 결정 함수입니다:

```ts
import { registerBehavior } from "./behaviors";

registerBehavior("내행동", (c) => {
  // c를 보고 결정해서
  return { move: c.nextHop(c.enemyTileId, c.playerTileId) };  // 또는 { attack: true } / {}
});
```

### BehaviorCtx — 받는 것

| 필드 | 무엇 |
|---|---|
| `enemyTileId` | 지금 내(적) 칸 |
| `playerTileId` | 플레이어 칸 |
| `vision` | 이 적의 시야(enemies.csv의 `vision`, BFS 거리 기준) |
| `rng()` | 0~1 난수. **`Math.random()` 대신 꼭 이걸 쓰세요** — 판 시드에 묶여 있어 세이브 이어하기·재현이 깨지지 않아요 |
| `neighbors(id)` | 그 칸과 연결된 칸들(엣지 방향 무시, 무방향) |
| `nextHop(from, to)` | BFS로 `to`에 가까워지는 첫 칸. 도달 불가거나 이미 같은 칸이면 `undefined` |
| `distance(from, to)` | 무방향 BFS 거리. 도달 불가면 `Infinity` |
| `state` | 이 적 전용의 지속 상태 객체(아래 §4) |

### BehaviorAction — 답하는 것

`{ move?: string; attack?: boolean }`. `attack`이 우선이고, 둘 다 없으면 정지입니다.

## 3. 기본 제공 5종 (읽으면 패턴이 보여요)

| 이름 | 한 줄 요약 | 코드에서 볼 것 |
|---|---|---|
| `chase` | BFS로 플레이어에게 접근 | 가장 단순한 형태 — `nextHop` 한 줄 |
| `wander` | 랜덤 이웃으로 배회 | `rng`·`neighbors` 사용법 |
| `ambush` | 잠복하다 시야에 들면 영구 활성화 후 추적 | **`state`로 상태 전이**를 만드는 법 |
| `turret` | 정지 포탑 — 시야 안이면 원거리 공격 | `attack` 사용법 |
| `ranged` | 시야 안이면 사격, 밖이면 접근 | 거리 기반 분기 |

## 4. 상태 가지기 (`state`) — 그리고 세이브 주의

`state`는 적 한 마리마다 따로 주어지는 객체로, 턴이 지나도 유지됩니다. `ambush`가 `state.activated`로 "한 번 깨어나면 계속 쫓는다"를 만드는 게 그 용례예요. 다단 페이즈, 순찰 경로 기억, 쿨다운 카운터 같은 상태 머신을 여기에 자유롭게 담으면 됩니다.

> ⚠️ **세이브에는 `state.activated`만 저장됩니다** ([SaveManager.ts](../src/core/SaveManager.ts)의 적 상태가 `tileId`/`stun`/`alive`/`activated`만 들고 있어요). 직접 추가한 다른 state 필드는 **저장을 이어서 하면 초기값으로 돌아갑니다.** 그러니:
> - 가능하면 상태를 `activated` 불리언 하나로 압축해 설계하거나(켜짐/꺼짐 패턴),
> - 새로고침 후 첫 호출에서 자연스럽게 재구성되는 상태(예: 매번 다시 계산해도 되는 캐시)만 담거나,
> - 정말 영속이 필요한 복합 상태라면 SaveManager의 적 상태 직렬화를 `state` 객체 전체로 넓히는 코드 작업이 함께 필요합니다.

## 5. 새 행동 추가 — 체크리스트 (세 군데)

예시: 플레이어가 다가오면 도망가는 `flee`.

**① 로직 — [src/core/behaviors.ts](../src/core/behaviors.ts)** (이것만으로 게임은 이미 동작)

```ts
// flee: 시야 안에 플레이어가 들면 가장 멀어지는 이웃으로 도망, 아니면 정지.
registerBehavior("flee", (c) => {
  if (c.distance(c.enemyTileId, c.playerTileId) > c.vision) return {};
  const ns = c.neighbors(c.enemyTileId);
  if (!ns.length) return {};
  let best = ns[0], bestD = -1;
  for (const n of ns) {
    const d = c.distance(n, c.playerTileId);
    if (d > bestD) { bestD = d; best = n; }
  }
  return { move: best };
});
```

**② 검증 — [tools/validate.mjs](../tools/validate.mjs)** 의 `BEHAVIORS` 집합에 이름 추가. 안 하면 `data:validate`가 "알 수 없는 behavior"라고 잘못 혼냅니다.

```js
const BEHAVIORS = new Set(["chase", "wander", "ambush", "turret", "ranged", "flee"]);
```

**③ 엑셀 드롭다운 — [tools/schema-meta.mjs](../tools/schema-meta.mjs)** 의 `ENUMS`에 추가 후 `npm run data:import`로 워크북 재생성. (`_안내`의 behavior 설명(`INFO`)도 한 줄 보태주면 친절해요.)

```js
"enemies.behavior": ["chase", "wander", "ambush", "turret", "ranged", "flee"],
```

그다음 `enemies.csv`의 `behavior` 칸에 `flee`라고 적으면 끝. 확인은 `npm run data:validate` → `play.bat` 순서로.

상태를 쓰는 예시 하나 더 — 자기 자리를 지키다, 침입자를 쫓고, 멀어지면 복귀하는 `sentinel`:

```ts
// sentinel: 첫 호출에 집 위치를 기억. 시야 침입 시 추적, 시야 밖이면 집으로 복귀.
registerBehavior("sentinel", (c) => {
  const s = c.state as { activated?: boolean; home?: string };
  s.home ??= c.enemyTileId;                       // 첫 스텝에 집 기억(세이브 복원 시에도 현재 칸으로 재구성됨)
  if (c.distance(c.enemyTileId, c.playerTileId) <= c.vision)
    return { move: c.nextHop(c.enemyTileId, c.playerTileId) };
  return { move: c.nextHop(c.enemyTileId, s.home) };  // 집이면 nextHop이 undefined → 정지
});
```

## 6. 지금 ctx로 안 되는 것 (확장 지점)

행동 함수는 위치·거리·난수·자기 상태만 봅니다. **플레이어의 스탯(HP 등) 읽기, 다른 적의 위치, 턴 수, 이벤트 직접 발동**은 현재 ctx에 없어요. 그런 패턴이 필요해지면 [GameScene.ts](../src/scenes/GameScene.ts) `moveEnemies`에서 `fn({...})`에 넘기는 객체에 필드를 추가하고 `BehaviorCtx` 인터페이스를 같이 넓히면 됩니다 — 호출부가 그 한 곳뿐이라 확장이 쌉니다. (스탯 기반 분기는 ctx 확장 없이 `cond_group`(활성 조건)으로 풀 수 있는 경우도 많으니 먼저 검토해 보세요.)
