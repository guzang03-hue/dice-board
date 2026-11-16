// CSV의 문자열 행을 도메인 타입으로 변환·검증한다.
// 빈 문자열 → undefined (생성기가 채울 수 있게).

import type { CsvRow } from "./csv";

// ---------- 공통 헬퍼 ----------
const numOpt = (s: string | undefined): number | undefined =>
  s === undefined || s === "" ? undefined : Number(s);
const numReq = (s: string | undefined, field: string, ctx: string): number => {
  const v = numOpt(s);
  if (v === undefined || Number.isNaN(v)) throw new Error(`[${ctx}] '${field}'은 숫자여야 함: '${s}'`);
  return v;
};
const strOpt = (s: string | undefined): string | undefined =>
  s === undefined || s === "" ? undefined : s;
const strReq = (s: string | undefined, field: string, ctx: string): string => {
  if (!s) throw new Error(`[${ctx}] '${field}'은 필수`);
  return s;
};
const boolFlag = (s: string | undefined): boolean => s === "1" || s?.toLowerCase() === "true";

// ---------- 도메인 타입 ----------
export interface GameConfig {
  start_tile: string;
  goal_tile?: string;
  seed?: number;
  board_name?: string;
  generator?: string;             // 기본 "weighted"
  dice?: string;                  // 주사위 표기 "2d6"/"d20"/"d6+1" (있으면 dice_sides보다 우선)
  dice_sides?: number;            // 단일 주사위 면 수(기본 6). dice 표기가 없을 때 사용
  [k: string]: unknown;
}

export interface ResourceDef {
  id: string;
  label: string;
  icon?: string;
  min?: number;
  max?: number;
  start: number;
  decay?: number;                 // 턴당 자동 증감(빈=0). 음수=감소
  type?: string;                  // number(기본) | bool. bool은 0/1 보유 상태(선언된 자원이라 표시 가능)
  visible?: boolean;              // HUD 노출 여부(기본 true). false면 추적만
  display?: string;               // bar | counter | flag | hidden (빈=자동: bool→flag, max有→bar, 그 외→counter)
  derived?: boolean;              // derived.csv의 대상이면 true(계산 전용, 효과로 직접 변경 안 함)
}

// ---------- stats (런-전역 통합 표) ----------
// v2: resources + statuses를 한 표로 통합. kind로 판별한다.
//   number/bool = 추적 자원(resources 뷰), status = 지속 상태(statuses 뷰).
// status의 매 턴 효과는 effects 참조 대신 인라인(per_turn_target/amount)으로 자족 — 전역→스테이지 참조 제거.
export type StatKind = "number" | "bool" | "status";
export interface StatDef {
  id: string;
  label: string;
  icon?: string;
  kind: StatKind;
  // kind=number/bool (자원)
  min?: number;
  max?: number;
  start: number;
  decay?: number;
  visible?: boolean;
  display?: string;
  // kind=status (상태)
  duration?: number;
  max_stacks?: number;
  per_turn_target?: string;       // 매 턴 증감 대상 stat id(빈=없음)
  per_turn_amount?: number;       // 매 턴 증감량(음수=감소). 중첩 수만큼 곱해 적용
}

export function toStats(rows: CsvRow[]): StatDef[] {
  return rows.map((r, i) => {
    const kind = (strOpt(r.kind) ?? "number") as StatKind;
    return {
      id: strReq(r.id, "id", `stats[${i}]`),
      label: strReq(r.label, "label", `stats[${i}]`),
      icon: strOpt(r.icon),
      kind,
      min: numOpt(r.min),
      max: numOpt(r.max),
      start: numOpt(r.start) ?? 0,
      decay: numOpt(r.decay),
      visible: r.visible === undefined || r.visible === "" ? true : boolFlag(r.visible),
      display: strOpt(r.display),
      duration: numOpt(r.duration),
      max_stacks: numOpt(r.max_stacks),
      per_turn_target: strOpt(r.per_turn_target),
      per_turn_amount: numOpt(r.per_turn_amount),
    };
  });
}

// stats → resources 뷰(kind!=status). kind=bool은 type='bool'로 매핑.
export function statsToResources(stats: StatDef[]): ResourceDef[] {
  return stats.filter(s => s.kind !== "status").map(s => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
    min: s.min,
    max: s.max,
    start: s.start,
    decay: s.decay,
    type: s.kind === "bool" ? "bool" : "number",
    visible: s.visible,
    display: s.display,
  }));
}

// stats → statuses 뷰(kind=status).
export function statsToStatuses(stats: StatDef[]): StatusDef[] {
  return stats.filter(s => s.kind === "status").map(s => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
    duration: s.duration ?? 1,
    max_stacks: s.max_stacks ?? 1,
    per_turn_target: s.per_turn_target,
    per_turn_amount: s.per_turn_amount,
  }));
}

export interface TileDef {
  id: string;
  x: number;
  y: number;
  type?: string;                  // 빈 칸이면 생성기가 채움
  sprite?: string;
  event_id?: string;
  region: string;
  locked: boolean;
  label?: string;
  stop: boolean;                  // true면 지나가다 닿으면 강제 정지(남은 이동 취소)
}

export interface EdgeDef {
  id?: string;                    // 형식상 PK(인조 surrogate). 참조엔 안 쓰임(from/to가 자연키)
  from: string;
  to: string;
  label?: string;                 // 기본 ""=주 경로, 분기면 선택지 버튼 문구
  cond_group?: string;            // conditions.group_id 참조. 통과 시에만 통행 가능(빈=항상)
}

export type EventType = "EFFECT" | "CHOICE" | "MOVE" | "NONE" | string;

export interface EventDef {
  id: string;
  type: EventType;
  cond_group?: string;            // conditions.group 참조(빈=항상 발동)
  probability?: number;           // 0..1, 기본 1
  payload?: string;               // effects.group 참조 (또는 MOVE 타입이면 "move:N")
  title?: string;
  text?: string;
  icon?: string;                  // 팝업에 표시할 이모지(아트 없을 때 폴백)
  image?: string;                 // 팝업 이미지 경로(스테이지 폴더 기준 상대). 로드 실패 시 icon 폴백
  // VN 렌더(M27): 아래 중 하나라도 있으면 VN 오버레이로 표시(없으면 기존 팝업).
  background?: string;            // 배경 ← assets.id(image) 또는 색(hex)
  speaker?: string;               // 대사 창 화자명(빈=sprite의 speaker 폴백)
  sprite1?: string;               // 등장 캐릭터 1 ← assets.id(kind=sprite)
  sprite2?: string;               // 등장 캐릭터 2 ← assets.id(kind=sprite)
  sprite3?: string;               // 등장 캐릭터 3 ← assets.id(kind=sprite)
}

export interface ChoiceDef {
  id?: string;                    // 형식상 PK(인조 surrogate). 참조엔 (event_id,choice_id)를 씀
  event_id: string;
  choice_id: string;
  text: string;
  cond_group?: string;            // conditions.group_id 참조, 미충족 시 비활성화
  result_effect_id?: string;      // effects.group_id 참조
  next_event?: string;            // 선택 후 이어서 실행할 events.id (연속 선택지/이벤트 체인)
}

export type EffectKind =
  | "GAIN" | "LOSE" | "SET" | "MOVE_TO" | "MOVE_DELTA"
  | "SKIP_TURN" | "SET_FLAG" | "RUN_EVENT" | "MSG"
  | "GIVE_ITEM" | "TAKE_ITEM" | "CHANGE_TILE"
  | string;

export interface EffectDef {
  id: string;                     // 고유 PK (행 식별용)
  group_id: string;               // 참조 키 (events.payload / choices.result_effect_id가 가리킴). 같은 값=한 묶음
  seq: number;                    // 같은 group_id 내 실행 순서(오름차순)
  kind: EffectKind;
  target?: string;                // 자원 id, 플래그명, 타일 id 등 kind 별 의미 다름
  value?: number | string;
}

export interface GenerationRule {
  id?: string;                    // 형식상 PK(인조 surrogate). 참조엔 (region,tile_type)를 씀
  region: string;
  tile_type: string;
  weight: number;
}

export interface AssetDef {
  id: string;
  kind: "image" | "audio" | "sprite" | string;
  path: string;
  // kind=sprite (VN 캐릭터) 전용 메타 — VN 렌더에서만 사용.
  speaker?: string;          // 기본 화자명(events.speaker가 비면 폴백)
  expr?: string;             // 표정 태그(자리만, 표정 전환 확장용)
  pos?: string;              // left | center | right (기본 center)
}

// ---------- 변환기 ----------
export function toConfig(rows: CsvRow[]): GameConfig {
  const cfg: any = {};
  for (const r of rows) {
    const k = r.key;
    const v = r.value;
    if (!k) continue;
    cfg[k] = v;
  }
  if (cfg.seed !== undefined && cfg.seed !== "") cfg.seed = Number(cfg.seed);
  if (cfg.dice_sides !== undefined && cfg.dice_sides !== "") cfg.dice_sides = Number(cfg.dice_sides);
  if (!cfg.start_tile) throw new Error("config.csv에 start_tile 필요");
  return cfg as GameConfig;
}

// v2: resources.csv는 stats.csv로 통합됨. 자원 뷰는 statsToResources()가 생성한다(위 stats 섹션).

export function toTiles(rows: CsvRow[]): TileDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `tiles[${i}]`),
    x: numReq(r.x, "x", `tiles[${i}]`),
    y: numReq(r.y, "y", `tiles[${i}]`),
    type: strOpt(r.type),
    sprite: strOpt(r.sprite),
    event_id: strOpt(r.event_id),
    region: r.region || "default",
    locked: boolFlag(r.locked),
    label: strOpt(r.label),
    stop: boolFlag(r.stop),
  }));
}

export function toEdges(rows: CsvRow[]): EdgeDef[] {
  return rows.map((r, i) => ({
    id: strOpt(r.id),
    from: strReq(r.from, "from", `edges[${i}]`),
    to: strReq(r.to, "to", `edges[${i}]`),
    label: strOpt(r.label),
    cond_group: strOpt(r.cond_group),
  }));
}

export function toEvents(rows: CsvRow[]): EventDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `events[${i}]`),
    type: (r.type || "NONE") as EventType,
    cond_group: strOpt(r.cond_group),
    probability: r.probability === "" || r.probability === undefined ? 1 : Number(r.probability),
    payload: strOpt(r.payload),
    title: strOpt(r.title),
    text: strOpt(r.text),
    icon: strOpt(r.icon),
    image: strOpt(r.image),
    background: strOpt(r.background),
    speaker: strOpt(r.speaker),
    sprite1: strOpt(r.sprite1),
    sprite2: strOpt(r.sprite2),
    sprite3: strOpt(r.sprite3),
  }));
}

export function toChoices(rows: CsvRow[]): ChoiceDef[] {
  return rows.map((r, i) => ({
    id: strOpt(r.id),
    event_id: strReq(r.event_id, "event_id", `choices[${i}]`),
    choice_id: strReq(r.choice_id, "choice_id", `choices[${i}]`),
    text: strReq(r.text, "text", `choices[${i}]`),
    cond_group: strOpt(r.cond_group),
    result_effect_id: strOpt(r.result_effect_id),
    next_event: strOpt(r.next_event),
  }));
}

export function toEffects(rows: CsvRow[]): EffectDef[] {
  return rows.map((r, i) => {
    const valStr = r.value;
    const valNum = valStr === "" || valStr === undefined ? undefined : Number(valStr);
    const value: number | string | undefined =
      valStr === "" || valStr === undefined ? undefined :
      Number.isNaN(valNum) ? valStr : valNum;
    return {
      id: strReq(r.id, "id", `effects[${i}]`),
      group_id: strReq(r.group_id, "group_id", `effects[${i}]`),
      seq: numOpt(r.seq) ?? 1,
      kind: strReq(r.kind, "kind", `effects[${i}]`) as EffectKind,
      target: strOpt(r.target),
      value,
    };
  });
}

// 효과 그룹 인덱스: group_id → seq 오름차순 정렬된 효과 행들.
export function indexEffects(defs: EffectDef[]): Map<string, EffectDef[]> {
  const m = new Map<string, EffectDef[]>();
  for (const e of defs) {
    const arr = m.get(e.group_id) ?? [];
    arr.push(e); m.set(e.group_id, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.seq - b.seq);
  return m;
}

export function toGeneration(rows: CsvRow[]): GenerationRule[] {
  return rows.map((r, i) => ({
    id: strOpt(r.id),
    region: strReq(r.region, "region", `generation[${i}]`),
    tile_type: strReq(r.tile_type, "tile_type", `generation[${i}]`),
    weight: numReq(r.weight, "weight", `generation[${i}]`),
  }));
}

export function toAssets(rows: CsvRow[]): AssetDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `assets[${i}]`),
    kind: (strReq(r.kind, "kind", `assets[${i}]`) as any),
    path: strReq(r.path, "path", `assets[${i}]`),
    speaker: strOpt(r.speaker),
    expr: strOpt(r.expr),
    pos: strOpt(r.pos),
  }));
}

// ---------- 타일 타입별 이벤트 풀 ----------
// 타일에 event_id가 없을 때 tile.type → 이 테이블에서 가중치 추첨.
// condition은 미니 DSL — 불충족 시 해당 행 제외 후 재추첨.
export interface TileEventDef {
  id?: string;            // 형식상 PK(인조 surrogate). 참조엔 (tile_type,event_id)를 씀
  tile_type: string;      // 'trap', 'boon', 'hazard', 'event', ...
  event_id: string;
  weight: number;
  cond_group?: string;    // conditions.group_id 참조. 미충족 시 풀에서 제외
}

export function toTileEvents(rows: CsvRow[]): TileEventDef[] {
  return rows.map((r, i) => ({
    id: strOpt(r.id),
    tile_type: strReq(r.tile_type, "tile_type", `tile_events[${i}]`),
    event_id: strReq(r.event_id, "event_id", `tile_events[${i}]`),
    weight: numReq(r.weight, "weight", `tile_events[${i}]`),
    cond_group: strOpt(r.cond_group),
  }));
}

// ---------- 조건 (구조화 술어, group으로 AND 묶음) ----------
export interface ConditionDef {
  id: string;             // 고유 PK (인조 식별자, 참조 안 함)
  group_id: string;       // 참조 키. 게이트 테이블의 cond_group이 가리킴(같은 값=AND)
  subject: string;        // 자원 id 또는 flag.<이름>
  op: string;             // min/max/over/under/is/not
  value: string;          // 숫자 또는 true/false
}

export function toConditions(rows: CsvRow[]): ConditionDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `conditions[${i}]`),
    group_id: strReq(r.group_id, "group_id", `conditions[${i}]`),
    subject: strReq(r.subject, "subject", `conditions[${i}]`),
    op: strReq(r.op, "op", `conditions[${i}]`),
    value: r.value ?? "",
  }));
}

// group_id → 술어 행들 (같은 group_id = AND).
export function indexConditions(defs: ConditionDef[]): Map<string, ConditionDef[]> {
  const m = new Map<string, ConditionDef[]>();
  for (const c of defs) {
    const arr = m.get(c.group_id) ?? [];
    arr.push(c); m.set(c.group_id, arr);
  }
  return m;
}

// ---------- 멀티 엔딩 ----------
// 게임 종료 시 자원/플래그 조건으로 엔딩을 고른다. priority 높은 순으로 평가,
// 첫 조건 충족 엔딩을 사용. when으로 승리/패배 상황을 구분(기본 any).
export interface EndingDef {
  id: string;
  when: string;          // victory | defeat | any
  cond_group?: string;   // conditions.group 참조, 빈값=항상참
  priority: number;      // 높을수록 먼저
  title: string;
  text?: string;
  icon?: string;
  image?: string;
  event?: string;
}

export function toEndings(rows: CsvRow[]): EndingDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `endings[${i}]`),
    when: (strOpt(r.when) ?? "any").toLowerCase(),
    cond_group: strOpt(r.cond_group),
    priority: numOpt(r.priority) ?? 0,
    title: strReq(r.title, "title", `endings[${i}]`),
    text: strOpt(r.text),
    icon: strOpt(r.icon),
    image: strOpt(r.image),
    event: strOpt(r.event),
  }));
}

// ---------- 스테이지 정의 ----------
export interface StageDef {
  id: string;
  name: string;
  description?: string;
  config_path: string;   // 해당 스테이지 CSV 폴더 경로 (예: /resources/data/)
  unlock_cost: number;   // 0 = 처음부터 해금
  icon?: string;
}

export function toStages(rows: CsvRow[]): StageDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `stages[${i}]`),
    name: strReq(r.name, "name", `stages[${i}]`),
    description: strOpt(r.description),
    config_path: strReq(r.config_path, "config_path", `stages[${i}]`),
    unlock_cost: numOpt(r.unlock_cost) ?? 0,
    icon: strOpt(r.icon),
  }));
}

// ---------- 메타 업그레이드 정의 ----------
export interface MetaUpgradeDef {
  id: string;
  label: string;
  description: string;
  cost: number;          // 랭크당 비용 (단순 고정값)
  effect_kind: string;   // GAIN / SET 등 (런 시작 시 적용)
  target?: string;       // 자원 id
  value: number;         // 랭크당 효과량
  max_rank: number;
}

export function toMetaUpgrades(rows: CsvRow[]): MetaUpgradeDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `meta[${i}]`),
    label: strReq(r.label, "label", `meta[${i}]`),
    description: strReq(r.description, "description", `meta[${i}]`),
    cost: numReq(r.cost, "cost", `meta[${i}]`),
    effect_kind: strReq(r.effect_kind, "effect_kind", `meta[${i}]`),
    target: strOpt(r.target),
    value: numReq(r.value, "value", `meta[${i}]`),
    max_rank: numReq(r.max_rank, "max_rank", `meta[${i}]`),
  }));
}

// ---------- 캐릭터 (선택) ----------
// characters.csv가 있으면 새 런 시작 시 캐릭터 선택. 선택한 캐릭터의 portrait/name이
// config.portrait/player_name를 덮어쓰고, start_effect_group이 시작 시 1회 적용된다.
export interface CharacterDef {
  id: string;
  name: string;
  portrait?: string;          // 이모지 또는 이미지 경로(config.portrait와 동일 규약)
  desc?: string;              // 선택 화면에 표시할 한 줄 설명
  start_effect_group?: string; // 시작 시 적용할 effects.group (자원 보정 등)
  icon?: string;              // 선택 버튼 앞 이모지(없으면 portrait가 이모지면 그걸 사용)
}

export function toCharacters(rows: CsvRow[]): CharacterDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `characters[${i}]`),
    name: strReq(r.name, "name", `characters[${i}]`),
    portrait: strOpt(r.portrait),
    desc: strOpt(r.desc),
    start_effect_group: strOpt(r.start_effect_group),
    icon: strOpt(r.icon),
  }));
}

// ---------- 스테이터스 (stats 뷰: kind=status) ----------
// 지속 상태(독/실드/리젠 등). 턴 시작마다 per_turn_target을 per_turn_amount만큼(중첩 수 곱) 증감하고
// duration을 줄여 0이 되면 만료한다. APPLY_STATUS 효과로 부여, status.<id> 조건으로 남은 턴 참조.
// v2: 매 턴 효과를 인라인 컬럼으로 자족화 → 전역 stats가 스테이지 effects를 가리키지 않음(불변식 유지).
export interface StatusDef {
  id: string;
  label: string;
  icon?: string;
  duration: number;             // 기본 지속 턴(APPLY_STATUS value로 override 가능)
  max_stacks: number;           // 중첩 한도(기본 1)
  per_turn_target?: string;     // 매 턴 증감할 stat id(빈=없음)
  per_turn_amount?: number;     // 매 턴 증감량(음수=감소). 중첩 수만큼 곱해 적용
}

// ---------- 파생 스탯 (선택) ----------
// 다른 자원들의 선형결합으로 자동 계산되는 자원. eval 금지 → 구조화 합산.
//   target = base + Σ(term_value × factor)   (term이 비면 base 상수 항)
// 같은 target 행들을 모두 더한다. 대상 자원은 resources.csv에도 선언(라벨/표시용)해야 함.
export interface DerivedRule {
  id?: string;      // 형식상 PK(인조 surrogate). 참조엔 (target,term)을 씀
  target: string;   // 계산 결과를 담을 stats.id (계산 전용)
  term?: string;    // 입력 stats.id (빈=상수 항)
  factor: number;   // 가중치(term 있으면 곱, 없으면 그대로 더함)
}

export function toDerived(rows: CsvRow[]): DerivedRule[] {
  return rows.map((r, i) => ({
    id: strOpt(r.id),
    target: strReq(r.target, "target", `derived[${i}]`),
    term: strOpt(r.term),
    factor: numOpt(r.factor) ?? 1,
  }));
}

// ---------- 임계 트리거 (선택) ----------
// 자원/상태/플래그가 임계 조건을 false→true로 넘는 순간 이벤트/효과를 발동.
//   subject/op/value는 conditions와 같은 술어. once=런당 1회, repeat=넘을 때마다.
export interface ThresholdDef {
  id: string;
  subject: string;   // 자원 id 또는 flag.<이름> / status.<id>
  op: string;        // min/max/over/under/is/not
  value: string;
  event?: string;    // 발동할 events.id (우선)
  effect?: string;   // 또는 effects.group
  mode: string;      // once | repeat (기본 repeat)
}

export function toThresholds(rows: CsvRow[]): ThresholdDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `thresholds[${i}]`),
    subject: strReq(r.subject, "subject", `thresholds[${i}]`),
    op: strReq(r.op, "op", `thresholds[${i}]`),
    value: r.value ?? "",
    event: strOpt(r.event),
    effect: strOpt(r.effect),
    mode: (strOpt(r.mode) ?? "repeat").toLowerCase(),
  }));
}

// ---------- 아이템 / 인벤토리 (선택) ----------
// 연속값 자원과 별개로 개별 아이템을 보유/사용. GIVE_ITEM/TAKE_ITEM 효과로 증감,
// item.<id> 조건으로 보유 수 참조. 사용 시 use_effect_group 실행(주사위 굴리기 전에만).
export interface ItemDef {
  id: string;
  name: string;
  icon?: string;
  desc?: string;
  use_effect_group?: string;   // 사용 시 실행할 effects.group(빈=사용 불가, 보유만)
  consumable: boolean;         // true면 사용 시 1개 소모(기본 true)
  max_stack: number;           // 최대 보유 수(0/빈=무제한, 초과분 버림)
  cond_group?: string;         // 사용 가능 조건(빈=항상). 미충족 시 칩 비활성
}

export function toItems(rows: CsvRow[]): ItemDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `items[${i}]`),
    name: strReq(r.name, "name", `items[${i}]`),
    icon: strOpt(r.icon),
    desc: strOpt(r.desc),
    use_effect_group: strOpt(r.use_effect_group),
    consumable: r.consumable === undefined || r.consumable === "" ? true : boolFlag(r.consumable),
    max_stack: numOpt(r.max_stack) ?? 0,
    cond_group: strOpt(r.cond_group),
  }));
}

// ---------- 적 (선택) ----------
// 다중 적 + behavior 레지스트리. config.enemy_* 대체. 접촉(같은 칸) 시 event 발동(데이터 대응형).
export interface EnemyDef {
  id: string;
  label?: string;
  icon?: string;
  start: string;             // 시작 tiles.id
  behavior: string;          // chase | wander | ambush | turret | ranged (registerBehavior)
  speed: number;             // 턴당 행동 횟수(기본 1)
  damage: number;            // event 없을 때 접촉/사격 피해(기본 1)
  event?: string;            // 접촉/사격 시 발동할 events.id (있으면 damage 대신, currentEnemy 컨텍스트)
  vision: number;            // 시야 BFS 거리(ambush/turret/ranged용, 기본 3)
  contact: string;           // move | pass | both (접촉 판정 주체)
  sprite?: string;           // 토큰 스프라이트(없으면 색 원)
  cond_group?: string;       // 활성 조건(빈=항상). 미충족 시 그 턴 비활성
}

export function toEnemies(rows: CsvRow[]): EnemyDef[] {
  return rows.map((r, i) => ({
    id: strReq(r.id, "id", `enemies[${i}]`),
    label: strOpt(r.label),
    icon: strOpt(r.icon),
    start: strReq(r.start, "start", `enemies[${i}]`),
    behavior: strOpt(r.behavior) ?? "chase",
    speed: numOpt(r.speed) ?? 1,
    damage: numOpt(r.damage) ?? 1,
    event: strOpt(r.event),
    vision: numOpt(r.vision) ?? 3,
    contact: (strOpt(r.contact) ?? "move").toLowerCase(),
    sprite: strOpt(r.sprite),
    cond_group: strOpt(r.cond_group),
  }));
}

// ---------- 통합 로딩 결과 ----------
export interface GameData {
  config: GameConfig;
  resources: ResourceDef[];
  tiles: TileDef[];
  edges: EdgeDef[];
  events: EventDef[];
  choices: ChoiceDef[];
  effects: EffectDef[];
  generation: GenerationRule[];
  tileEvents: TileEventDef[];
  conditions: ConditionDef[];
  assets: AssetDef[];
  endings: EndingDef[];     // 선택. endings.csv 없으면 빈 배열
  characters: CharacterDef[]; // 선택. characters.csv 없으면 빈 배열
  statuses: StatusDef[];    // 선택. statuses.csv 없으면 빈 배열
  derived: DerivedRule[];   // 선택. derived.csv 없으면 빈 배열
  thresholds: ThresholdDef[]; // 선택. thresholds.csv 없으면 빈 배열
  enemies: EnemyDef[];      // 선택. enemies.csv 없으면 빈 배열
  items: ItemDef[];         // 선택. items.csv 없으면 빈 배열
}

// v2 2레이어 스코프.
//  - 전역(런): 플레이어가 들고 다니는 정의 + 외부 참조 없는 어휘. data/ 루트에 한 벌.
//  - 스테이지: 이 보드의 배치·스크립트. data/<stage>/ 폴더마다.
// 전역은 한 번 읽어 캐시하고, 스테이지마다 합친다(병합이 아니라 각자 다른 표).
export const GLOBAL_TABLES = ["stats", "generation", "assets"] as const;          // 필수 전역
export const GLOBAL_OPTIONAL_TABLES = ["derived"] as const;                        // 선택 전역
export const STAGE_REQUIRED_TABLES = [
  "config", "tiles", "edges", "events", "choices", "effects", "tile_events", "conditions",
] as const;
