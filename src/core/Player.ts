import type { ResourceDef, DerivedRule } from "../data/schema";

// 자원/능력치 보유자. resources.csv 정의를 따라 동적으로 키를 가짐.
// min/max는 정의되어 있을 때만 clamp.

export interface ResourceChange {
  id: string;
  before: number;
  after: number;
  delta: number;
}

// 활성 상태 한 건: 남은 턴 + 중첩 수.
export interface ActiveStatus { remaining: number; stacks: number; }

export class Player {
  readonly defs: Map<string, ResourceDef>;
  private values: Map<string, number>;
  flags: Map<string, boolean | number | string> = new Map();
  // 활성 지속 상태 (status id → 남은 턴/중첩). StatusEngine이 턴마다 갱신.
  statuses: Map<string, ActiveStatus> = new Map();
  // 인벤토리 (item id → 보유 수). GIVE_ITEM/TAKE_ITEM으로 증감, item.<id> 조건으로 참조.
  inventory: Map<string, number> = new Map();
  // 파생 스탯 규칙 (target → 합산 항들). 자원 변동 시 자동 재계산.
  private derivedRules: Map<string, DerivedRule[]> = new Map();

  constructor(defs: ResourceDef[]) {
    this.defs = new Map(defs.map(d => [d.id, d]));
    this.values = new Map(defs.map(d => [d.id, d.start]));
  }

  // 파생 규칙 등록 — 대상 자원을 derived로 표시하고 초기 계산.
  setDerived(rules: DerivedRule[]) {
    this.derivedRules.clear();
    for (const r of rules) {
      const def = this.defs.get(r.target);
      if (def) def.derived = true;       // 계산 전용 표시(HUD/효과 참고)
      const arr = this.derivedRules.get(r.target) ?? [];
      arr.push(r); this.derivedRules.set(r.target, arr);
    }
    this.recomputeDerived();
  }

  // 모든 파생 대상을 base + Σ(term×factor)로 재계산. 체인 파생을 위해 몇 번 반복.
  recomputeDerived() {
    if (this.derivedRules.size === 0) return;
    const passes = Math.max(1, this.derivedRules.size);
    for (let p = 0; p < passes; p++) {
      for (const [target, terms] of this.derivedRules) {
        let sum = 0;
        for (const t of terms) sum += t.term ? (this.values.get(t.term) ?? 0) * t.factor : t.factor;
        this.setRaw(target, sum);
      }
    }
  }

  // 상태 부여. 이미 있으면 남은 턴을 max로 갱신하고 중첩을 maxStacks까지 +1.
  applyStatus(id: string, duration: number, maxStacks = 1): ActiveStatus {
    const cur = this.statuses.get(id);
    const next: ActiveStatus = cur
      ? { remaining: Math.max(cur.remaining, duration), stacks: Math.min(maxStacks, cur.stacks + 1) }
      : { remaining: duration, stacks: 1 };
    this.statuses.set(id, next);
    return next;
  }
  clearStatus(id: string): void { this.statuses.delete(id); }
  // 남은 턴 수(없으면 0) — 조건 status.<id> 평가용.
  statusRemaining(id: string): number { return this.statuses.get(id)?.remaining ?? 0; }

  // ── 인벤토리 ──
  // 아이템 증감. maxStack>0이면 그 수로 상한 clamp(초과분 버림). 0 이하가 되면 항목 제거.
  giveItem(id: string, qty = 1, maxStack = 0): number {
    let next = (this.inventory.get(id) ?? 0) + qty;
    if (maxStack > 0 && next > maxStack) next = maxStack;
    if (next <= 0) { this.inventory.delete(id); return 0; }
    this.inventory.set(id, next);
    return next;
  }
  takeItem(id: string, qty = 1): number { return this.giveItem(id, -Math.abs(qty)); }
  // 보유 수(없으면 0) — 조건 item.<id> 평가용.
  itemCount(id: string): number { return this.inventory.get(id) ?? 0; }

  get(id: string): number {
    const v = this.values.get(id);
    if (v === undefined) throw new Error(`존재하지 않는 자원: ${id}`);
    return v;
  }

  // 내부 설정(clamp만, 파생 재계산 안 함). 파생 재계산 루프가 사용.
  private setRaw(id: string, v: number): ResourceChange {
    const def = this.defs.get(id);
    if (!def) throw new Error(`존재하지 않는 자원: ${id}`);
    const before = this.values.get(id)!;
    let after = v;
    if (def.min !== undefined && after < def.min) after = def.min;
    if (def.max !== undefined && after > def.max) after = def.max;
    this.values.set(id, after);
    return { id, before, after, delta: after - before };
  }

  set(id: string, v: number): ResourceChange {
    const c = this.setRaw(id, v);
    this.recomputeDerived();   // 입력 자원이 바뀌면 파생 자원 갱신
    return c;
  }

  add(id: string, delta: number): ResourceChange {
    return this.set(id, this.get(id) + delta);
  }

  entries(): { def: ResourceDef; value: number }[] {
    return [...this.defs.values()].map(def => ({ def, value: this.values.get(def.id)! }));
  }
}
