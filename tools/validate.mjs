#!/usr/bin/env node
// 데이터 무결성 + 맵 구조 검증기 (v2 2레이어).
//   node tools/validate.mjs            전역 + 모든 스테이지 검사
//   node tools/validate.mjs stage01    전역 + 특정 스테이지 폴더만
//
// v2 레이어:
//   전역(런) = data/ 루트: stats / generation / assets / derived / stages / meta / ui
//   스테이지  = data/<stage>/: config / tiles / edges / events / choices / effects /
//               conditions / tile_events (+선택: endings / characters / thresholds / enemies / items)
//
// 검사 항목:
//   [표]   헤더가 스키마와 맞는가(필수 컬럼 누락=오류, 미지 컬럼=경고 — 옛 양식/오타 감지)
//   [표]   필수 칸 비어 있음(엔진 변환기 strReq/numReq가 던지는 자리) · 숫자 칸 형식 · enum 값
//   [전역] 고유 ID 유일성 · derived/stats/meta가 전역 stats만 가리키는지(런-전역→스테이지 참조 금지 불변식)
//   [전역] stages.csv ↔ 실제 폴더 일치(없는 폴더 참조=오류, 미등록 폴더=경고)
//   [참조] 스테이지 FK가 실제로 존재하는가(전역 stats/assets/generation 포함)
//   [참조] conditions/thresholds의 subject가 실제 stats/status/item을 가리키는가
//   [고유] 각 표의 id 컬럼 유일성
//   [구조] start/goal 존재 · 도달성 · 막다른 칸 · 전부 조건부 분기 · generation 미정의 region
//   [동작] CHOICE 이벤트에 선택지 0개(진행 불가) · move:N 형식 · probability 범위
//
// 종료 코드: 오류(❌) 있으면 1, 경고(⚠)만 있으면 0.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, ENUMS, UI_SETTING_KEYS, CONFIG_ENGINE_KEYS, UI_THEME_KEYS, UI_KEY_PREFIXES } from "./schema-meta.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "resources", "data");

const TYPE = new Set(["int", "integer", "float", "double", "number", "string", "str", "bool", "boolean"]);
// CSV → { header(키 행), rows(키→값 객체) }. 3행 헤더(한글/키/타입) 자동 감지.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") { } else f += c; }
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const cl = rows.filter(r => r.length > 0 && !(r.length === 1 && r[0].trim() === "") && !(r[0].trim().startsWith("#")));
  if (cl.length === 0) return { header: null, rows: [] };
  const three = cl.length >= 3 && cl[2].map(c => c.trim()).filter(c => c).every(c => TYPE.has(c.toLowerCase()));
  const k = three ? 1 : 0, s = three ? 3 : 1, h = cl[k].map(x => x.trim()), out = [];
  for (let i = s; i < cl.length; i++) { const r = cl[i], o = {}; h.forEach((H, j) => o[H] = (r[j] ?? "").trim()); out.push(o); }
  return { header: h, rows: out };
}
// 표 적재. 파일 없음 = { header:null, rows:[], exists:false } (선택 표).
const loadT = (dir, name) => {
  const p = join(dir, name + ".csv");
  if (!existsSync(p)) return { header: null, rows: [], exists: false };
  return { ...parseCsv(readFileSync(p, "utf8")), exists: true };
};
const cfgMap = (rows) => Object.fromEntries(rows.map(r => [r.key, r.value]));

// key/value 표(config/ui)의 미지 키 — 오타 감지용 "경고"(에러 아님: 접두 통로·실험 키 보호).
function warnUnknownKeys(rows, known, label, warns) {
  const set = new Set(known);
  for (const r of rows) {
    const k = (r.key ?? "").trim();
    if (!k || set.has(k) || UI_KEY_PREFIXES.some(p => k.startsWith(p))) continue;
    warns.push(`${label}: 알 수 없는 키 '${k}' — 오타라면 엔진이 조용히 무시합니다 (의도한 확장 키면 무방)`);
  }
}

// ───────── 표 공통 검사 (스키마 기반) ─────────
// 엔진 변환기(schema.ts)가 strReq/numReq로 던지는 필수 칸 — 여기 비면 그 스테이지는 로드 자체가 실패한다.
const REQUIRED = {
  stats: ["id", "label"],
  generation: ["region", "tile_type", "weight"],
  assets: ["id", "kind", "path"],
  derived: ["target"],
  meta: ["id", "label", "description", "cost", "effect_kind", "value", "max_rank"],
  stages: ["id", "name", "config_path"],
  tiles: ["id", "x", "y"],
  edges: ["from", "to"],
  events: ["id"],
  choices: ["event_id", "choice_id", "text"],
  effects: ["id", "group_id", "kind"],
  conditions: ["id", "group_id", "subject", "op"],
  tile_events: ["tile_type", "event_id", "weight"],
  endings: ["id", "title"],
  characters: ["id", "name"],
  thresholds: ["id", "subject", "op"],
  enemies: ["id", "start"],
  items: ["id", "name"],
};
const NUM_TYPES = new Set(["int", "integer", "float", "double", "number"]);
// 엔진이 소문자로 정규화해 읽는 enum 컬럼(대소문자 무시 비교). 그 외는 정확히 일치해야 한다.
const LOWERED_ENUMS = new Set(["endings.when", "thresholds.mode", "enemies.contact"]);
// 코드 레지스트리로 확장 가능한 enum — 오류 메시지에 등록 안내를 덧붙인다.
const REGISTRY_ENUMS = { "effects.kind": "registerEffect", "enemies.behavior": "registerBehavior" };

function rowName(table, r, i) {
  if (table === "choices") return `${r.event_id || "?"}/${r.choice_id || "?"}`;
  if (table === "edges") return r.id || `${r.from || "?"}→${r.to || "?"}`;
  return r.id || r.key || `${i + 1}번째 행`;
}

// 헤더(필수 컬럼 누락/미지 컬럼) + 행(필수 칸/숫자/enum) 검사. rows를 돌려준다.
function checkTable(table, parsed, errs, warns, label = table) {
  if (!parsed.exists) return parsed.rows;
  const meta = SCHEMA[table];
  const req = REQUIRED[table] ?? [];
  const { header, rows } = parsed;
  if (!header) return rows;   // 빈 파일(헤더 없음) — 선택 표 골격으로 무해

  // 헤더: 필수 컬럼이 아예 없으면 그 칸 전부가 undefined로 읽혀 "조용히 전부 통과"가 된다 — 가장 위험.
  if (meta) {
    const known = new Set(meta.cols.map(c => c.key));
    for (const col of req) {
      if (!header.includes(col)) errs.push(`${label}: 헤더에 필수 컬럼 '${col}'이 없음 — 옛 양식이거나 오타예요. data:import로 새 워크북과 비교해 보세요.`);
    }
    for (const h of header) {
      if (h && !known.has(h)) warns.push(`${label}: 스키마에 없는 컬럼 '${h}' — 오타거나 옛 양식(엔진은 무시함)`);
    }
  }

  const numCols = meta ? meta.cols.filter(c => NUM_TYPES.has(c.type)).map(c => c.key).filter(k => header.includes(k)) : [];
  const enumCols = Object.entries(ENUMS)
    .filter(([key]) => key.startsWith(table + "."))
    .map(([key, vals]) => ({ col: key.split(".")[1], vals, key }))
    .filter(({ col }) => header.includes(col) && SCHEMA[table]?.cols.find(c => c.key === col)?.type !== "bool");

  rows.forEach((r, i) => {
    const who = `${label} ${rowName(table, r, i)}`;
    for (const col of req) {
      if (!(r[col] ?? "").trim()) errs.push(`${who}: 필수 칸 '${col}' 비어 있음 (엔진 로드 실패)`);
    }
    for (const col of numCols) {
      const v = (r[col] ?? "").trim();
      if (v && Number.isNaN(Number(v))) errs.push(`${who}: '${col}'은 숫자여야 함 ('${v}')`);
    }
    for (const { col, vals, key } of enumCols) {
      const v = (r[col] ?? "").trim();
      if (!v) continue;
      const ok = LOWERED_ENUMS.has(key) ? vals.includes(v.toLowerCase()) : vals.includes(v);
      if (!ok) {
        const hint = REGISTRY_ENUMS[key] ? ` — 코드에서 ${REGISTRY_ENUMS[key]}로 등록한 새 종류라면 schema-meta.mjs ENUMS에도 추가하세요` : "";
        errs.push(`${who}: '${col}'은 ${vals.join("/")} 중 하나 ('${v}')${hint}`);
      }
    }
  });
  return rows;
}

// 고유 id 유일성 검사 — 표의 id 컬럼에 중복이 있으면 오류로 모은다.
function checkUniqueIds(rows, label, errs, col = "id") {
  const seen = new Set();
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) errs.push(`${label}: ${col} 중복 '${v}'`);
    seen.add(v);
  }
}

// conditions/thresholds의 subject가 실제 대상을 가리키는지.
// 형식: <stats.id> | player.<stats.id> | flag.<이름>(동적—검사 생략) | status.<id> | item.<id>
function checkSubject(who, subject, itemIds, errs) {
  if (!subject) return;
  if (subject.startsWith("flag.")) return;
  if (subject.startsWith("status.")) {
    const id = subject.slice(7);
    if (!statusIds.has(id)) errs.push(`${who}: subject의 status '${id}' 미존재 (전역 stats kind=status)`);
    return;
  }
  if (subject.startsWith("item.")) {
    const id = subject.slice(5);
    if (!itemIds.has(id)) errs.push(`${who}: subject의 item '${id}' 미존재 (이 스테이지 items.csv)`);
    return;
  }
  const id = subject.startsWith("player.") ? subject.slice(7) : subject;
  if (statIds.size && !statIds.has(id)) errs.push(`${who}: subject '${id}'가 전역 stats에 없음 (flag.x/status.x/item.x 접두사를 빠뜨렸나요?)`);
}

// 술어 value는 숫자 또는 true/false여야 비교가 성립(그 외는 조용히 항상 거짓이 됨).
function checkPredicateValue(who, value, errs) {
  const v = (value ?? "").trim();
  if (!v) return;   // 빈 값 = 0과 비교(엔진 규약)
  if (v === "true" || v === "false") return;
  if (Number.isNaN(Number(v))) errs.push(`${who}: value '${v}'는 숫자 또는 true/false여야 함 (그 외엔 항상 거짓으로 평가됨)`);
}

// data/ 아래에서 config.csv를 가진 폴더 = 스테이지 (루트는 전역 전용이라 제외)
function findStageDirs(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) {
      if (existsSync(join(f, "config.csv"))) acc.push(f);
      findStageDirs(f, acc);
    }
  }
  return acc;
}

// ───────── 전역 레이어 ─────────
const statsT = loadT(DATA_DIR, "stats");
const generationT = loadT(DATA_DIR, "generation");
const assetsT = loadT(DATA_DIR, "assets");
const derivedT = loadT(DATA_DIR, "derived");
const metaT = loadT(DATA_DIR, "meta");
const uiT = loadT(DATA_DIR, "ui");
const stagesT = loadT(DATA_DIR, "stages");
const stats = statsT.rows, generation = generationT.rows, assets = assetsT.rows,
  derived = derivedT.rows, meta = metaT.rows, ui = uiT.rows, stageRows = stagesT.rows;

const statIds = new Set(stats.map(s => s.id));
const statusIds = new Set(stats.filter(s => s.kind === "status").map(s => s.id));
const resourceIds = new Set(stats.filter(s => s.kind !== "status").map(s => s.id));
const assetIds = new Set(assets.map(a => a.id));
const spriteIds = new Set(assets.filter(a => a.kind === "sprite").map(a => a.id));
const genRegions = new Set(generation.map(g => g.region));

const allStageDirs = findStageDirs(DATA_DIR);

function validateGlobal() {
  const errs = [], warns = [];
  // 표 공통 검사(헤더/필수/숫자/enum)
  checkTable("stats", statsT, errs, warns);
  checkTable("generation", generationT, errs, warns);
  checkTable("assets", assetsT, errs, warns);
  checkTable("derived", derivedT, errs, warns);
  checkTable("meta", metaT, errs, warns);
  checkTable("stages", stagesT, errs, warns);
  // 필수 전역 표 자체가 없으면 부팅 불가
  for (const [t, parsed] of [["stats", statsT], ["generation", generationT], ["assets", assetsT], ["stages", stagesT]]) {
    if (!parsed.exists) errs.push(`전역 ${t}.csv 없음 — 게임 부팅에 필요`);
  }
  // 고유 ID 유일성
  checkUniqueIds(stats, "stats", errs);
  checkUniqueIds(generation, "generation", errs);
  checkUniqueIds(derived, "derived", errs);
  checkUniqueIds(assets, "assets", errs);
  checkUniqueIds(meta, "meta", errs);
  checkUniqueIds(stageRows, "stages", errs);
  // ui.csv: key/value 전역 설정 — key 중복 검사(theme.ts가 마지막 값으로 덮어쓰므로 중복은 실수 신호).
  checkUniqueIds(ui, "ui", errs, "key");
  // ui.csv 미지 키 경고(테마 키 + UI 확장 키 + config 공용 UI 키가 전역 기본값으로 허용됨).
  warnUnknownKeys(ui, [...UI_THEME_KEYS, ...UI_SETTING_KEYS], "ui", warns);
  // 불변식: 런-전역 표는 전역 stats만 가리킨다(스테이지 행 참조 금지).
  for (const d of derived) {
    if (d.target && !statIds.has(d.target)) errs.push(`derived ${d.id ?? d.target}: target 미존재 stats '${d.target}'`);
    if (d.term && !statIds.has(d.term)) errs.push(`derived ${d.id ?? d.target}: term 미존재 stats '${d.term}'`);
  }
  for (const s of stats) {
    if (s.per_turn_target && !statIds.has(s.per_turn_target)) errs.push(`stats ${s.id}: per_turn_target 미존재 stats '${s.per_turn_target}'`);
  }
  for (const m of meta) {
    if (m.target && !resourceIds.has(m.target)) errs.push(`meta ${m.id}: target 미존재 자원 stats '${m.target}'`);
  }
  // stages.csv ↔ 실제 폴더: 없는 폴더를 가리키면 그 스테이지 선택 시 로드 실패.
  const registeredDirs = new Set();
  for (const s of stageRows) {
    if (!s.config_path) continue;
    const relPath = s.config_path.replace(/^\//, "").replace(/\/$/, "");   // "resources/data/<id>"
    const abs = join(ROOT, "public", ...relPath.split("/"));
    registeredDirs.add(resolve(abs));
    if (!existsSync(abs)) errs.push(`stages ${s.id}: config_path 폴더 없음 '${s.config_path}'`);
    else if (!existsSync(join(abs, "config.csv"))) errs.push(`stages ${s.id}: '${s.config_path}'에 config.csv 없음`);
  }
  // 반대: 폴더는 있는데 stages.csv에 미등록 — 게임 스테이지 목록에 안 나온다.
  for (const d of allStageDirs) {
    if (!registeredDirs.has(resolve(d))) warns.push(`폴더 '${relative(DATA_DIR, d).replace(/\\/g, "/")}'가 stages.csv에 미등록 — 게임에서 선택 불가`);
  }
  return { errs, warns };
}

function validateStage(dir) {
  const rel = relative(ROOT, dir);
  const errs = [], warns = [];
  const tilesT = loadT(dir, "tiles"), edgesT = loadT(dir, "edges"), eventsT = loadT(dir, "events"),
    choicesT = loadT(dir, "choices"), effectsT = loadT(dir, "effects"), conditionsT = loadT(dir, "conditions"),
    tileEventsT = loadT(dir, "tile_events"), endingsT = loadT(dir, "endings"),
    charactersT = loadT(dir, "characters"), thresholdsT = loadT(dir, "thresholds"),
    enemiesT = loadT(dir, "enemies"), itemsT = loadT(dir, "items"), configT = loadT(dir, "config");

  // 필수 표 존재(없으면 엔진 loadAll이 실패)
  for (const [t, parsed] of [["tiles", tilesT], ["edges", edgesT], ["events", eventsT], ["choices", choicesT],
    ["effects", effectsT], ["conditions", conditionsT], ["tile_events", tileEventsT]]) {
    if (!parsed.exists) errs.push(`${t}.csv 없음 — 필수 표(스테이지 로드 실패). table:add 또는 stage:new 골격 참고`);
  }

  // 표 공통 검사(헤더/필수/숫자/enum)
  const tiles = checkTable("tiles", tilesT, errs, warns);
  const edges = checkTable("edges", edgesT, errs, warns);
  const events = checkTable("events", eventsT, errs, warns);
  const choices = checkTable("choices", choicesT, errs, warns);
  const effects = checkTable("effects", effectsT, errs, warns);
  const conditions = checkTable("conditions", conditionsT, errs, warns);
  const tileEvents = checkTable("tile_events", tileEventsT, errs, warns);
  const endings = checkTable("endings", endingsT, errs, warns);
  const characters = checkTable("characters", charactersT, errs, warns);
  const thresholds = checkTable("thresholds", thresholdsT, errs, warns);
  const enemies = checkTable("enemies", enemiesT, errs, warns);
  const items = checkTable("items", itemsT, errs, warns);
  checkTable("config", configT, errs, warns);
  const cfg = cfgMap(configT.rows);
  // config 미지 키 경고(엔진 키 + UI 확장 키 외 — 오타 감지).
  warnUnknownKeys(configT.rows, [...CONFIG_ENGINE_KEYS, ...UI_SETTING_KEYS], "config", warns);

  const tileIds = new Set(tiles.map(t => t.id));
  const effGroups = new Set(effects.map(e => e.group_id));
  const condGroups = new Set(conditions.map(c => c.group_id));
  const eventIds = new Set(events.map(e => e.id));
  const itemIds = new Set(items.map(it => it.id));

  // ---------- 고유 ID 유일성 ----------
  checkUniqueIds(tiles, "tiles", errs);
  checkUniqueIds(events, "events", errs);
  checkUniqueIds(effects, "effects", errs);
  checkUniqueIds(conditions, "conditions", errs);
  checkUniqueIds(edges, "edges", errs);
  checkUniqueIds(tileEvents, "tile_events", errs);
  checkUniqueIds(choices, "choices", errs);
  checkUniqueIds(endings, "endings", errs);
  checkUniqueIds(characters, "characters", errs);
  checkUniqueIds(thresholds, "thresholds", errs);
  checkUniqueIds(enemies, "enemies", errs);
  checkUniqueIds(items, "items", errs);

  // ---------- 참조 무결성 ----------
  for (const e of edges) {
    if (e.from && !tileIds.has(e.from)) errs.push(`edge.from 미존재 타일: ${e.from}`);
    if (e.to && !tileIds.has(e.to)) errs.push(`edge.to 미존재 타일: ${e.to}`);
    if (e.cond_group && !condGroups.has(e.cond_group)) errs.push(`edge ${e.from}→${e.to}: cond_group 미존재 '${e.cond_group}'`);
  }
  const choicesByEvent = new Map();
  for (const c of choices) {
    const arr = choicesByEvent.get(c.event_id) ?? [];
    arr.push(c); choicesByEvent.set(c.event_id, arr);
  }
  for (const ev of events) {
    if (ev.payload && !ev.payload.startsWith("move:") && !effGroups.has(ev.payload)) errs.push(`event ${ev.id}: payload 미존재 효과그룹 '${ev.payload}'`);
    if (ev.payload && ev.payload.startsWith("move:") && Number.isNaN(Number(ev.payload.slice(5)))) errs.push(`event ${ev.id}: payload '${ev.payload}' — move: 뒤는 숫자여야 함`);
    if (ev.cond_group && !condGroups.has(ev.cond_group)) errs.push(`event ${ev.id}: cond_group 미존재 '${ev.cond_group}'`);
    // CHOICE인데 선택지가 하나도 없으면 팝업에 버튼이 없어 진행 불가(소프트락).
    if (ev.type === "CHOICE" && !(choicesByEvent.get(ev.id)?.length)) errs.push(`event ${ev.id}: type=CHOICE인데 choices.csv에 선택지가 없음 (진행 불가)`);
    if (ev.probability) {
      const p = Number(ev.probability);
      if (!Number.isNaN(p) && (p < 0 || p > 1)) warns.push(`event ${ev.id}: probability ${p} — 0~1 범위 밖(0 이하=절대 발동 안 함, 1 이상=항상)`);
    }
    // VN(M27): sprite1/2/3는 전역 assets(kind=sprite)·background는 assets.id 또는 색/경로
    for (const key of ["sprite1", "sprite2", "sprite3"]) {
      const s = ev[key];
      if (s && assetIds.size) {
        const sid = s.trim();
        if (!spriteIds.has(sid) && !sid.includes("/") && !sid.includes(".")) {
          errs.push(`event ${ev.id}: ${key} 미존재 (전역 assets kind=sprite) '${sid}'`);
        }
      }
    }
    if (ev.background && !ev.background.startsWith("#") && !ev.background.includes("/") && !ev.background.includes(".")
      && assetIds.size && !assetIds.has(ev.background))
      warns.push(`event ${ev.id}: background '${ev.background}'가 assets.id에도 색(#)/경로에도 없음`);
  }
  for (const c of choices) {
    if (!eventIds.has(c.event_id)) errs.push(`choice ${c.event_id}/${c.choice_id}: event_id 미존재`);
    if (c.result_effect_id && !effGroups.has(c.result_effect_id)) errs.push(`choice ${c.event_id}/${c.choice_id}: result_effect_id 미존재 '${c.result_effect_id}'`);
    if (c.cond_group && !condGroups.has(c.cond_group)) errs.push(`choice ${c.event_id}/${c.choice_id}: cond_group 미존재 '${c.cond_group}'`);
    if (c.next_event && !eventIds.has(c.next_event)) errs.push(`choice ${c.event_id}/${c.choice_id}: next_event 미존재 '${c.next_event}'`);
  }
  // 효과 대상 검사 — kind별로 전역 stats(자원/상태)·아이템·이벤트를 가리킨다.
  const RESOURCE_KINDS = new Set(["GAIN", "LOSE", "SET"]);
  for (const ef of effects) {
    if (RESOURCE_KINDS.has(ef.kind)) {
      if (!ef.target) errs.push(`effect ${ef.id}: ${ef.kind}에 대상 stats.id 없음`);
      else if (statIds.size && !resourceIds.has(ef.target)) errs.push(`effect ${ef.id}: ${ef.kind} 대상 자원 미존재 '${ef.target}' (전역 stats)`);
    }
    if (ef.kind === "MOVE_TO" && ef.target && !tileIds.has(ef.target)) errs.push(`effect ${ef.id}: MOVE_TO 대상 타일 미존재 '${ef.target}'`);
    if (ef.kind === "RUN_EVENT") {
      const tgt = (ef.target && ef.target.trim()) || (ef.value && ef.value.trim()) || "";
      if (!tgt) errs.push(`effect ${ef.id}: RUN_EVENT에 대상 events.id 없음`);
      else if (!eventIds.has(tgt)) errs.push(`effect ${ef.id}: RUN_EVENT 대상 이벤트 미존재 '${tgt}'`);
    }
    if (ef.kind === "APPLY_STATUS" || ef.kind === "CLEAR_STATUS") {
      if (!ef.target) errs.push(`effect ${ef.id}: ${ef.kind}에 대상 stats(status).id 없음`);
      else if (statusIds.size && !statusIds.has(ef.target)) errs.push(`effect ${ef.id}: ${ef.kind} 대상 상태 미존재 '${ef.target}' (전역 stats kind=status)`);
    }
    if (ef.kind === "GIVE_ITEM" || ef.kind === "TAKE_ITEM") {
      if (!ef.target) errs.push(`effect ${ef.id}: ${ef.kind}에 대상 items.id 없음`);
      else if (!itemIds.has(ef.target)) errs.push(`effect ${ef.id}: ${ef.kind} 대상 아이템 미존재 '${ef.target}'${itemIds.size ? "" : " (items.csv가 없음 — table:add로 켜세요)"}`);
    }
  }
  // conditions: subject 대상 존재 + value 형식
  for (const c of conditions) {
    checkSubject(`condition ${c.id || c.group_id}`, c.subject, itemIds, errs);
    checkPredicateValue(`condition ${c.id || c.group_id}`, c.value, errs);
  }
  // items: use_effect_group → effects.group_id, cond_group → conditions.group_id
  for (const it of items) {
    if (it.use_effect_group && !effGroups.has(it.use_effect_group)) errs.push(`item ${it.id}: use_effect_group 미존재 효과그룹 '${it.use_effect_group}'`);
    if (it.cond_group && !condGroups.has(it.cond_group)) errs.push(`item ${it.id}: cond_group 미존재 '${it.cond_group}'`);
  }
  // thresholds: event/effect 참조 + 둘 중 하나는 있어야 + subject/value 형식
  for (const t of thresholds) {
    if (!t.event && !t.effect) errs.push(`threshold ${t.id}: event 또는 effect 중 하나는 필요`);
    if (t.event && !eventIds.has(t.event)) errs.push(`threshold ${t.id}: event 미존재 '${t.event}'`);
    if (t.effect && !effGroups.has(t.effect)) errs.push(`threshold ${t.id}: effect 미존재 효과그룹 '${t.effect}'`);
    checkSubject(`threshold ${t.id}`, t.subject, itemIds, errs);
    checkPredicateValue(`threshold ${t.id}`, t.value, errs);
  }
  // enemies: start 타일·event 참조 + sprite(전역 assets). behavior/contact enum은 공통 검사가 처리.
  for (const en of enemies) {
    if (en.start && !tileIds.has(en.start)) errs.push(`enemy ${en.id}: start 미존재 타일 '${en.start}'`);
    if (en.event && !eventIds.has(en.event)) errs.push(`enemy ${en.id}: event 미존재 '${en.event}'`);
    if (en.cond_group && !condGroups.has(en.cond_group)) errs.push(`enemy ${en.id}: cond_group 미존재 '${en.cond_group}'`);
    if (en.sprite && assetIds.size && !assetIds.has(en.sprite) && !en.sprite.includes("/") && !en.sprite.includes(".")) warns.push(`enemy ${en.id}: sprite '${en.sprite}'가 전역 assets.id에도 경로에도 없음`);
  }
  for (const te of tileEvents) {
    if (te.event_id && !eventIds.has(te.event_id)) errs.push(`tile_event ${te.tile_type}/${te.event_id}: event_id 미존재`);
    if (te.cond_group && !condGroups.has(te.cond_group)) errs.push(`tile_event ${te.tile_type}/${te.event_id}: cond_group 미존재 '${te.cond_group}'`);
  }
  for (const en of endings) {
    if (en.cond_group && !condGroups.has(en.cond_group)) errs.push(`ending ${en.id}: cond_group 미존재 '${en.cond_group}'`);
  }
  for (const ch of characters) {
    if (ch.start_effect_group && !effGroups.has(ch.start_effect_group)) errs.push(`character ${ch.id}: start_effect_group 미존재 '${ch.start_effect_group}'`);
  }
  for (const t of tiles) {
    if (t.event_id && !eventIds.has(t.event_id)) errs.push(`tile ${t.id}: event_id 미존재 '${t.event_id}'`);
    if (t.sprite && assetIds.size && !assetIds.has(t.sprite) && !t.sprite.includes("/") && !t.sprite.includes(".")) warns.push(`tile ${t.id}: sprite '${t.sprite}'가 전역 assets.id에도 경로에도 없음`);
  }

  // ---------- 구조 ----------
  const start = cfg.start_tile, goal = cfg.goal_tile;
  if (!start) errs.push(`config.start_tile 없음`);
  else if (!tileIds.has(start)) errs.push(`config.start_tile 미존재 타일: '${start}'`);
  if (goal && !tileIds.has(goal)) errs.push(`config.goal_tile 미존재 타일: '${goal}'`);
  if (cfg.dice_sides && Number.isNaN(Number(cfg.dice_sides))) errs.push(`config.dice_sides는 숫자여야 함 ('${cfg.dice_sides}')`);
  for (const hook of ["on_turn_start", "on_turn_end"]) {
    if (cfg[hook] && !effGroups.has(cfg[hook])) errs.push(`config.${hook} 미존재 효과그룹: '${cfg[hook]}'`);
  }
  if (cfg.lose_cond_group && !condGroups.has(cfg.lose_cond_group)) errs.push(`config.lose_cond_group 미존재 조건그룹: '${cfg.lose_cond_group}'`);

  // 인접(모든 라벨/조건 무시한 위상 그래프)
  const adj = new Map();
  for (const id of tileIds) adj.set(id, []);
  for (const e of edges) if (tileIds.has(e.from) && tileIds.has(e.to)) adj.get(e.from).push(e.to);

  // start에서 BFS
  if (start && tileIds.has(start)) {
    const seen = new Set([start]); const qd = [start];
    while (qd.length) { const u = qd.shift(); for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); qd.push(v); } }
    const unreachable = [...tileIds].filter(id => !seen.has(id));
    if (unreachable.length) warns.push(`start(${start})에서 도달 불가 칸 ${unreachable.length}개: ${unreachable.slice(0, 8).join(", ")}${unreachable.length > 8 ? " …" : ""}`);
    if (goal && tileIds.has(goal) && !seen.has(goal)) errs.push(`goal(${goal})에 start에서 도달할 수 없음`);
  }

  // 막다른 칸 (out-edge 0, goal 아님)
  const deadends = [...tileIds].filter(id => adj.get(id).length === 0 && id !== goal);
  if (deadends.length) warns.push(`막다른 칸(전진 불가, goal 아님) ${deadends.length}개: ${deadends.slice(0, 8).join(", ")}${deadends.length > 8 ? " …" : ""}`);

  // 전부 조건부인 분기 (out-edge가 있는데 모두 cond_group 보유 → 고립 위험)
  const outByTile = new Map();
  for (const e of edges) { const a = outByTile.get(e.from) ?? []; a.push(e); outByTile.set(e.from, a); }
  for (const [id, outs] of outByTile) {
    if (outs.length > 0 && outs.every(e => e.cond_group)) warns.push(`칸 ${id}: 모든 출구가 조건부 — 조건 미충족 시 멈출 수 있음(주경로 1개는 무조건 권장)`);
  }

  // generation 미정의 region (빈 타입 타일이 안 채워짐; default 폴백 없으면)
  const hasDefault = genRegions.has("default");
  const emptyTiles = tiles.filter(t => !t.type && t.locked !== "1");
  const missRegions = [...new Set(emptyTiles.map(t => t.region || "default"))].filter(r => !genRegions.has(r) && !hasDefault);
  if (missRegions.length) warns.push(`generation(전역) 미정의 region(빈 칸 안 채워짐): ${missRegions.join(", ")}`);

  return { rel, errs, warns, counts: { tiles: tiles.length, edges: edges.length, events: events.length, conditions: condGroups.size, effects: effGroups.size } };
}

const filter = process.argv[2];
let stageDirs = allStageDirs;
if (filter) stageDirs = stageDirs.filter(d => relative(DATA_DIR, d).replace(/\\/g, "/").includes(filter));
if (stageDirs.length === 0) { console.error("스테이지 폴더(config.csv 포함)를 찾지 못함"); process.exit(1); }

let totalErr = 0, totalWarn = 0;

// 전역 레이어 먼저
{
  const { errs, warns } = validateGlobal();
  console.log(`\n■ [전역] ${relative(ROOT, DATA_DIR)}  (stats ${stats.length} · generation ${generation.length} · derived ${derived.length} · assets ${assets.length} · stages ${stageRows.length})`);
  for (const e of errs) console.log(`  ❌ ${e}`);
  for (const w of warns) console.log(`  ⚠  ${w}`);
  if (!errs.length && !warns.length) console.log("  ✅ 이상 없음");
  totalErr += errs.length; totalWarn += warns.length;
}

for (const dir of stageDirs) {
  const { rel, errs, warns, counts } = validateStage(dir);
  console.log(`\n■ ${rel}  (타일 ${counts.tiles} · 엣지 ${counts.edges} · 이벤트 ${counts.events} · 조건그룹 ${counts.conditions} · 효과그룹 ${counts.effects})`);
  for (const e of errs) console.log(`  ❌ ${e}`);
  for (const w of warns) console.log(`  ⚠  ${w}`);
  if (!errs.length && !warns.length) console.log("  ✅ 이상 없음");
  totalErr += errs.length; totalWarn += warns.length;
}
console.log(`\n${totalErr ? "❌" : "✅"} 오류 ${totalErr} · 경고 ${totalWarn}`);
process.exit(totalErr ? 1 : 0);
