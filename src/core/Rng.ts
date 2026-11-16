// mulberry32 PRNG. 시드(32-bit unsigned)로 결정적인 0..1 시퀀스.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 문자열 → 32-bit seed (cyrb32 lite). 사용자가 seed에 문자 입력해도 동작.
export function strHash(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function makeRng(seed: number | string | undefined): () => number {
  if (seed === undefined || seed === null || seed === "" as any) {
    return Math.random;
  }
  const s = typeof seed === "string" ? strHash(seed) : seed >>> 0;
  return mulberry32(s);
}

// 가중 추첨. items[i].weight 사용.
export function weightedPick<T extends { weight: number }>(items: T[], rng: () => number): T | undefined {
  if (items.length === 0) return undefined;
  let total = 0;
  for (const it of items) total += Math.max(0, it.weight);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, it.weight);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
