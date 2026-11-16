// 가벼운 주사위. RNG 주입 가능 — 시드 PRNG로 교체할 수 있게.
// 다중 주사위/표기법 지원: count d sides (+modifier). 예) d6, 2d6, d20, 2d6+1.
export type Rng = () => number;

export class Dice {
  constructor(
    private readonly sides: number,
    private readonly rng: Rng = Math.random,
    private readonly count: number = 1,
    private readonly modifier: number = 0,
  ) {}

  // count개를 굴려 합산 + modifier.
  roll(): number {
    let sum = this.modifier;
    for (let i = 0; i < this.count; i++) sum += 1 + Math.floor(this.rng() * this.sides);
    return sum;
  }

  get min(): number { return this.count + this.modifier; }
  get max(): number { return this.count * this.sides + this.modifier; }
  get label(): string {
    const base = `${this.count}d${this.sides}`;
    return this.modifier ? `${base}${this.modifier > 0 ? "+" : ""}${this.modifier}` : base;
  }
}

// config.dice("2d6"/"d20"/"d6+1") 또는 config.dice_sides(숫자) → Dice.
// 우선순위: dice 표기 > dice_sides(단일 주사위) > 기본 d6.
export function makeDice(
  diceSpec: string | number | undefined,
  diceSides: number | undefined,
  rng: Rng,
): Dice {
  if (typeof diceSpec === "string") {
    const m = diceSpec.trim().match(/^(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?$/i);
    if (m) {
      const count = m[1] ? Number(m[1]) : 1;
      const sides = Number(m[2]);
      const modifier = m[3] ? Number(m[3].replace(/\s+/g, "")) : 0;
      if (sides > 0 && count > 0) return new Dice(sides, rng, count, modifier);
    }
    // "6" 같은 숫자 문자열 폴백
    const n = Number(diceSpec);
    if (!Number.isNaN(n) && n > 0) return new Dice(n, rng);
  } else if (typeof diceSpec === "number" && diceSpec > 0) {
    return new Dice(diceSpec, rng);
  }
  return new Dice(diceSides && diceSides > 0 ? diceSides : 6, rng);
}
