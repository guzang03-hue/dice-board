// 구조화 조건 평가.
// conditions.csv의 행({subject, op, value})을 group으로 묶어 평가한다.
// 같은 group의 모든 술어가 참이면 통과(AND). group 없음/미정의 = 무조건 통과.
//
// subject: 자원 id(hp/gold/torch/rep) 또는 flag.<이름> 또는 player.<자원> 또는 status.<id>(남은 턴) 또는 item.<id>(보유 수)
// op: min(>=) max(<=) over(>) under(<) is(==) not(!=)
// value: 숫자 또는 true/false(플래그 진리값)

export interface Predicate {
  subject: string;
  op: string;
  value: string;
}

export type CondCtx = {
  res: (id: string) => number;
  flag: (k: string) => boolean | number | string | undefined;
  status?: (id: string) => number;   // status.<id> → 남은 턴 수(없으면 0)
  item?: (id: string) => number;     // item.<id> → 보유 수(없으면 0)
};

// 플래그 진리값 해석 (미설정/0/false/""/"0"/"false" = 거짓)
const truthy = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== 0 && v !== false && v !== "" && v !== "0" && v !== "false";

function lhs(subject: string, ctx: CondCtx): { num: number; raw: unknown } {
  let raw: unknown;
  if (subject.startsWith("flag.")) raw = ctx.flag(subject.slice(5));
  else if (subject.startsWith("status.")) raw = ctx.status?.(subject.slice(7)) ?? 0;
  else if (subject.startsWith("item.")) raw = ctx.item?.(subject.slice(5)) ?? 0;
  else if (subject.startsWith("player.")) raw = ctx.res(subject.slice(7));
  else raw = ctx.res(subject);
  const num = typeof raw === "number" ? raw : Number(raw);
  return { num: Number.isNaN(num) ? 0 : num, raw };
}

function testOne(p: Predicate, ctx: CondCtx): boolean {
  const { num, raw } = lhs(p.subject, ctx);
  const v = (p.value ?? "").trim();
  // 불리언 비교 (flag.x is true / not false)
  if (v === "true" || v === "false") {
    const want = v === "true";
    if (p.op === "is") return truthy(raw) === want;
    if (p.op === "not") return truthy(raw) !== want;
  }
  const rhs = Number(v);
  switch (p.op) {
    case "min": return num >= rhs;   // 이상 (>=)
    case "max": return num <= rhs;   // 이하 (<=)
    case "over": return num > rhs;   // 초과 (>)
    case "under": return num < rhs;  // 미만 (<)
    case "is": return num === rhs;   // 같음 (==)
    case "not": return num !== rhs;  // 다름 (!=)
    default: throw new Error(`미지원 연산자: '${p.op}' (min/max/over/under/is/not)`);
  }
}

// 단일 술어 평가 (임계 트리거 등 group 밖에서 쓰는 진입점).
export function evalPredicate(subject: string, op: string, value: string, ctx: CondCtx): boolean {
  return testOne({ subject, op, value }, ctx);
}

// group의 모든 술어가 참이면 true.
export function evalConditions(
  group: string | undefined,
  byGroup: Map<string, Predicate[]>,
  ctx: CondCtx,
): boolean {
  if (!group) return true;
  const preds = byGroup.get(group);
  if (!preds || preds.length === 0) return true;
  return preds.every((p) => testOne(p, ctx));
}
