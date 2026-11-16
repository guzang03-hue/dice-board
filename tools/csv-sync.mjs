#!/usr/bin/env node
// 게임 데이터 CSV ↔ 엑셀 동기화 도구 (exceljs 기반 하이브리드 워크북).
//
//   node tools/csv-sync.mjs migrate          1행 헤더 CSV → 3행 헤더(한글/변수/타입)
//   node tools/csv-sync.mjs bom              모든 CSV에 UTF-8 BOM
//   node tools/csv-sync.mjs import           CSV → 마스터 + 도메인 워크북 4개 (드롭다운/색/헬퍼/조건부서식)
//   node tools/csv-sync.mjs export [대상]    워크북 → CSV. 대상: master(기본)|map|narrative|entity|setup
//   node tools/csv-sync.mjs stage:list       스테이지 목록(stages.csv + 폴더 유무)
//   node tools/csv-sync.mjs stage:new <id>   스테이지 폴더 골격 생성 + stages.csv 등록 (+워크북 재생성)
//   node tools/csv-sync.mjs stage:rm  <id>   스테이지 폴더 삭제 + stages.csv에서 제거 (+워크북 재생성)
//   node tools/csv-sync.mjs table:add <스테이지> <표>   선택 표 생성(3행 헤더, endings/characters/enemies/items/thresholds 등) (+워크북 재생성)
//   node tools/csv-sync.mjs table:rm  <스테이지> <표>   선택 표 삭제(필수 표는 거부) (+워크북 재생성)
//   node tools/csv-sync.mjs strings          데이터 텍스트 + 코드 tu() → strings.csv(key, ko) 추출(기존 번역 보존)
//   node tools/csv-sync.mjs strings:build    strings.csv의 언어 컬럼 → strings_<lang>.json (ko 제외, 인라인 기본)
//
// 진실원은 CSV. 엑셀은 생성되는 작업 뷰다. 시트명: 하위폴더는 점(.)으로(hero/events → "hero.events").
// import는 워크북을 재생성한다(자동 서식 항상 최신). 평소 작업은 편집→export 루프라 수동 편집은 유지된다.
// export는 stages.csv에 등록된 스테이지의 시트만 내보낸다 — 옛 워크북에 남은 삭제 스테이지 시트가
// CSV로 되살아나는 사고를 막는다. stage:new/rm은 끝에 import를 자동 실행해 워크북을 항상 최신으로 둔다.
//
// v2 2레이어: 전역(런) 표(stats/derived/generation/assets/stages/meta)는 data/ 루트 한 벌,
// 스테이지 표는 data/<stage>/ 폴더마다. 스테이지 폴더에는 전역 표를 두지 않는다.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { SCHEMA, tableOf, DOMAINS, domainOf, REFS, ENUMS, NAME_COL, INFO, GUIDE_INTRO, layerOf, STAGE_TABLES, GLOBAL_TABLES, TEXT_COLS, STRING_KEY_TABLE, UI_TEXT_KEYS } from "./schema-meta.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "resources", "data");
const TOOLS = join(ROOT, "tools");
const MASTER_PATH = join(TOOLS, "dice-board-tables.xlsx");
const domainPath = (d) => join(TOOLS, `domain-${d}.xlsx`);
const BOM = "﻿";
const BUFFER_ROWS = 120;   // 드롭다운/조건부서식을 데이터 아래 여유 행까지 적용(새 행 대비)

// ───────── 공통 유틸 (migrate/bom과 공유) ─────────
function findCsvFiles(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) findCsvFiles(full, base, acc);
    else if (name.toLowerCase().endsWith(".csv")) acc.push(relative(base, full));
  }
  return acc;
}
const relToSheet = (rel) => rel.replace(/\\/g, "/").replace(/\.csv$/i, "").replace(/\//g, ".");
const sheetToRel = (sheet) => {
  const parts = sheet.split(".");
  const table = parts.pop();
  return parts.length ? join(...parts, `${table}.csv`) : `${table}.csv`;
};
const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

function parseLine(line) {
  const out = []; let f = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { out.push(f); f = ""; } else f += c; }
  }
  out.push(f);
  return out;
}
const toLine = (cells) => cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
const isKeyRow = (cols, keySet) => {
  const a = cols.map((c) => c.trim()).filter((c) => c !== "");
  return a.length > 0 && a.every((c) => keySet.has(c));
};
function writeSafe(path, content, rel) {
  try { writeFileSync(path, content, "utf8"); return true; }
  catch (e) {
    if (e.code === "EBUSY" || e.code === "EPERM") { console.warn(`  ! 잠김(엑셀): ${rel}`); return false; }
    throw e;
  }
}
const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };

// ───────── migrate / bom (변경 없음) ─────────
function cmdMigrate() {
  const files = findCsvFiles(DATA_DIR);
  let done = 0, already = 0, skip = 0;
  for (const rel of files) {
    const table = tableOf(basename(rel));
    const meta = SCHEMA[table];
    if (!meta) { console.warn(`  ? 스키마 없음, 건너뜀: ${rel}`); skip++; continue; }
    const keySet = new Set(meta.cols.map((c) => c.key));
    const koOf = (k) => meta.cols.find((c) => c.key === k)?.ko ?? k;
    const typeOf = (k) => meta.cols.find((c) => c.key === k)?.type ?? "string";
    const path = join(DATA_DIR, rel);
    const text = stripBom(readFileSync(path, "utf8"));
    const lines = text.split(/\r?\n/);
    const realIdx = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim() !== "" && !l.trim().startsWith("#"));
    if (realIdx.length === 0) { skip++; continue; }
    const first = realIdx[0], second = realIdx[1];
    if (isKeyRow(parseLine(first.l), keySet)) {
      const cols = parseLine(first.l).map((c) => c.trim());
      const out = [...lines.slice(0, first.i), toLine(cols.map(koOf)), lines[first.i], toLine(cols.map(typeOf)), ...lines.slice(first.i + 1)];
      let joined = out.join("\n"); if (!joined.endsWith("\n")) joined += "\n";
      if (writeSafe(path, BOM + joined, rel)) { console.log(`  + 3행화 ${rel}`); done++; }
    } else if (second && isKeyRow(parseLine(second.l), keySet)) already++;
    else { console.warn(`  ? 헤더 불일치, 건너뜀: ${rel}`); skip++; }
  }
  console.log(`\n변환 ${done} · 이미3행 ${already} · 건너뜀 ${skip}`);
}
function cmdBom() {
  const files = findCsvFiles(DATA_DIR);
  let changed = 0, had = 0, locked = 0;
  for (const rel of files) {
    const path = join(DATA_DIR, rel);
    const text = readFileSync(path, "utf8");
    if (text.charCodeAt(0) === 0xfeff) { had++; continue; }
    if (writeSafe(path, BOM + text, rel)) { changed++; console.log(`  + BOM ${rel}`); } else locked++;
  }
  console.log(`\n추가 ${changed} · 이미있음 ${had} · 잠김 ${locked}`);
}

// ───────── CSV 적재 (엑셀 생성용) ─────────
// 각 엔트리: { rel, table, stage, sheet, aoa, keyRowIdx, dataStart, keys }
function loadEntries() {
  const entries = [];
  for (const rel of findCsvFiles(DATA_DIR).sort()) {
    const table = tableOf(basename(rel));
    const meta = SCHEMA[table];
    const stage = dirname(rel) === "." ? "" : dirname(rel).replace(/\\/g, "/");
    const text = stripBom(readFileSync(join(DATA_DIR, rel), "utf8"));
    const aoa = text.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === "")).map(parseLine);
    const keys = meta ? new Set(meta.cols.map((c) => c.key)) : new Set();
    // 키 행 = 스키마 키를 가장 많이 포함한 행(헬퍼열 있어도 견고)
    let keyRowIdx = 0, best = -1;
    aoa.forEach((r, i) => { const n = r.filter((c) => keys.has(String(c).trim())).length; if (n > best) { best = n; keyRowIdx = i; } });
    // 타입 행이 있으면(3행 헤더) 데이터는 keyRow+2부터, 아니면 keyRow+1
    const typeRowMaybe = aoa[keyRowIdx + 1] ?? [];
    const TYPES = new Set(["int", "integer", "float", "double", "number", "string", "str", "bool", "boolean"]);
    const hasType = typeRowMaybe.map((c) => String(c).trim()).filter(Boolean).every((c) => TYPES.has(c.toLowerCase())) && typeRowMaybe.some((c) => String(c).trim());
    const dataStart = keyRowIdx + (hasType ? 2 : 1) + 1; // 1-based 첫 데이터 행
    entries.push({ rel, table, stage, sheet: relToSheet(rel).slice(0, 31), aoa, keyRowIdx, dataStart, meta });
  }
  return entries;
}

// stage+refTable → Map(id → name)  (헬퍼열 표시용)
function buildNameMaps(entries) {
  const maps = {};
  for (const e of entries) {
    const nameCol = NAME_COL[e.table];
    if (!nameCol) continue;
    const header = e.aoa[e.keyRowIdx].map((c) => String(c).trim());
    const idIdx = header.indexOf("id"); const nameIdx = header.indexOf(nameCol);
    if (idIdx < 0) continue;
    const m = new Map();
    for (let r = e.dataStart - 1; r < e.aoa.length; r++) {
      const row = e.aoa[r]; if (!row) continue;
      const id = String(row[idIdx] ?? "").trim(); if (!id) continue;
      m.set(id, nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : id);
    }
    maps[`${e.stage}|${e.table}`] = m;
  }
  return maps;
}

// 워크북 하나 작성. tablesFilter=null이면 전 테이블(마스터).
function buildWorkbook(entries, nameMaps, tablesFilter) {
  const wb = new ExcelJS.Workbook();
  const inWb = (t) => !tablesFilter || tablesFilter.includes(t);
  const present = new Set(entries.filter((e) => inWb(e.table)).map((e) => e.sheet));

  // 인덱스 시트
  const idx = wb.addWorksheet("_Index", { properties: { tabColor: { argb: "FF9E9E9E" } } });
  idx.addRow(["Dice Board 데이터", tablesFilter ? `도메인: ${tablesFilter.join(", ")}` : "마스터(전체)"]);
  idx.addRow([]);
  idx.addRow(["시트", "도메인", "설명"]);
  idx.getRow(1).font = { bold: true, size: 13 };
  idx.getRow(3).font = { bold: true };
  for (const e of entries) {
    if (!inWb(e.table)) continue;
    const desc = INFO[e.table]?.overview ?? "";
    idx.addRow([e.sheet, DOMAINS[domainOf(e.table)]?.label ?? "", desc]);
  }
  idx.columns = [{ width: 22 }, { width: 12 }, { width: 90 }];
  idx.eachRow((r) => { r.getCell(3).alignment = { wrapText: true, vertical: "top" }; });

  // 안내 시트(설명을 한 시트로 모음) — 인덱스 바로 다음에 둔다
  const tablesPresent = new Set(entries.filter((e) => inWb(e.table)).map((e) => e.table));
  addGuideSheet(wb, tablesPresent);

  for (const e of entries) {
    if (!inWb(e.table)) continue;
    addDataSheet(wb, e, entries, nameMaps, present);
  }
  return wb;
}

// 모든 표의 사람용 설명을 "_안내" 한 시트로 모은다(도메인별 배너 + 표별 섹션).
function addGuideSheet(wb, tablesPresent) {
  const ws = wb.addWorksheet("_안내", { properties: { tabColor: { argb: "FFFFCA28" } } });
  ws.columns = [{ width: 26 }, { width: 100 }];
  const wrap = { wrapText: true, vertical: "top" };

  const title = ws.addRow(["📖 Dice Board 데이터 안내", ""]);
  title.getCell(1).font = { bold: true, size: 14 };
  for (const line of GUIDE_INTRO) {
    const r = ws.addRow(["", line]);
    r.getCell(2).alignment = wrap;
    r.getCell(2).font = { color: { argb: "FF555555" }, size: 10 };
  }
  ws.addRow([]);

  for (const [, v] of Object.entries(DOMAINS)) {
    const here = v.tables.filter((t) => tablesPresent.has(t) && INFO[t]);
    if (!here.length) continue;

    // 도메인 배너 (한 줄 병합 + 색)
    const banner = ws.addRow([`${v.label}`, ""]);
    ws.mergeCells(`A${banner.number}:B${banner.number}`);
    banner.getCell(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    banner.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: v.color } };
    banner.getCell(1).alignment = { vertical: "middle" };
    banner.height = 20;

    for (const t of here) {
      const info = INFO[t];
      // 표 머리: 이름(왼쪽) + 개요(오른쪽)
      const head = ws.addRow([`▸ ${t}`, info.overview]);
      head.getCell(1).font = { bold: true, size: 11, color: { argb: v.color } };
      head.getCell(1).alignment = { vertical: "top" };
      head.getCell(2).alignment = wrap;
      // 항목별 설명
      for (const row of info.rows) {
        const r = ws.addRow([row.name, row.desc]);
        r.getCell(1).font = { bold: true, color: { argb: "FF333333" } };
        r.getCell(1).alignment = { vertical: "top" };
        r.getCell(2).alignment = wrap;
      }
      ws.addRow([]);
    }
  }
}

function addDataSheet(wb, e, entries, nameMaps, presentSheets) {
  const domain = domainOf(e.table);
  const color = DOMAINS[domain]?.color ?? "FF607D8B";
  const ws = wb.addWorksheet(e.sheet, {
    properties: { tabColor: { argb: color } },
    views: [{ state: "frozen", ySplit: e.dataStart - 1 }],
  });
  const header = e.aoa[e.keyRowIdx].map((c) => String(c).trim());
  const ncol = header.length;

  // 본문(헤더 3행 + 데이터) 그대로 기록
  e.aoa.forEach((row, i) => {
    const r = ws.getRow(i + 1);
    row.forEach((c, j) => { r.getCell(j + 1).value = c === "" ? null : c; });
  });
  // 헤더 스타일
  for (let hr = 1; hr <= e.dataStart - 1; hr++) {
    const r = ws.getRow(hr);
    r.font = { bold: hr === 1 };
    r.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hr === 1 ? color : "FF2A2A2A" } }; cell.font = { bold: hr === 1, color: { argb: "FFFFFFFF" }, size: hr === 1 ? 11 : 10 }; });
  }

  // 드롭다운 + 조건부서식 (FK는 같은 워크북에 참조 시트가 있을 때만)
  const firstData = e.dataStart, lastData = e.dataStart + BUFFER_ROWS;
  header.forEach((key, j) => {
    const letter = colLetter(j + 1);
    const enumVals = ENUMS[`${e.table}.${key}`];
    const ref = REFS[`${e.table}.${key}`];
    let listFormula = null;
    if (enumVals) listFormula = `"${enumVals.join(",")}"`;
    else if (ref) {
      const [refTable] = ref.split(".");
      // 레이어 인식: 전역 표는 루트(stage="")에서, 스테이지 표는 같은 스테이지에서 찾는다.
      const refStage = layerOf(refTable) === "global" ? "" : e.stage;
      const refEntry = entries.find((x) => x.table === refTable && x.stage === refStage);
      if (refEntry && presentSheets.has(refEntry.sheet)) {
        const refHeader = refEntry.aoa[refEntry.keyRowIdx].map((c) => String(c).trim());
        const refKey = ref.split(".")[1];
        const refIdx = refHeader.indexOf(refKey);
        if (refIdx >= 0) {
          const rl = colLetter(refIdx + 1);
          listFormula = `'${refEntry.sheet}'!$${rl}$${refEntry.dataStart}:$${rl}$${refEntry.dataStart + 500}`;
          // 조건부서식: 참조에 없는 값이면 빨강
          ws.addConditionalFormatting({
            ref: `${letter}${firstData}:${letter}${lastData}`,
            rules: [{ type: "expression", priority: 1, formulae: [`AND(${letter}${firstData}<>"",COUNTIF('${refEntry.sheet}'!$${rl}:$${rl},${letter}${firstData})=0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } } }],
          });
        }
      }
    }
    if (listFormula) {
      for (let row = firstData; row <= lastData; row++) {
        ws.getCell(`${letter}${row}`).dataValidation = { type: "list", allowBlank: true, formulae: [listFormula], showErrorMessage: false };
      }
    }
  });

  // 헬퍼열(참조 이름) — 스키마 키 아닌 헤더라 export에서 제거됨
  let helperCol = ncol + 1;
  header.forEach((key, j) => {
    const ref = REFS[`${e.table}.${key}`];
    if (!ref) return;
    const [refTable, refKey] = ref.split(".");
    if (refKey !== "id" || !NAME_COL[refTable]) return;   // id 참조 + 이름컬럼 있을 때만
    const refStage = layerOf(refTable) === "global" ? "" : e.stage;
    const nm = nameMaps[`${refStage}|${refTable}`];
    if (!nm) return;
    const L = colLetter(helperCol);
    ws.getCell(`${L}1`).value = `↪${key}`;
    ws.getCell(`${L}2`).value = `__name_${key}`;   // 비스키마 키 → export 제거
    ws.getCell(`${L}3`).value = "string";
    ws.getCell(`${L}1`).font = { italic: true, color: { argb: "FF888888" } };
    for (let row = e.dataStart; row <= e.aoa.length; row++) {
      const id = String(e.aoa[row - 1]?.[j] ?? "").trim();
      if (id) ws.getCell(`${L}${row}`).value = nm.get(id) ? `→ ${nm.get(id)}` : "⚠ 없음";
    }
    helperCol++;
  });

  // 컬럼 폭
  ws.columns.forEach((col) => { col.width = Math.max(10, Math.min(28, col.width || 12)); });
  // 표별 설명은 더 이상 시트마다 두지 않고, "_안내" 한 시트에 모은다(addGuideSheet).
}

async function cmdImport() {
  const entries = loadEntries();
  const nameMaps = buildNameMaps(entries);
  const targets = [{ path: MASTER_PATH, filter: null, label: "마스터" },
    ...Object.entries(DOMAINS).map(([d, v]) => ({ path: domainPath(d), filter: v.tables, label: `도메인:${d}` }))];
  for (const t of targets) {
    const wb = buildWorkbook(entries, nameMaps, t.filter);
    try { await wb.xlsx.writeFile(t.path); console.log(`  → ${t.label}  ${relative(ROOT, t.path)} (${wb.worksheets.length}시트)`); }
    catch (e) {
      if (e.code === "EBUSY" || e.code === "EPERM") { console.error(`  ! 잠김(엑셀 열림): ${relative(ROOT, t.path)} — 닫고 재실행`); }
      else throw e;
    }
  }
  console.log(`\nimport 완료: 마스터 + 도메인 ${Object.keys(DOMAINS).length}개. 진실원은 CSV(편집 후 export).`);
}

async function cmdExport(which = "master") {
  const path = which === "master" ? MASTER_PATH : domainPath(which);
  if (!existsSync(path)) { console.error(`워크북 없음: ${relative(ROOT, path)} — 먼저 import 하세요.`); process.exit(1); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  // 스테이지 부활 방지: stages.csv에 등록되지 않은 스테이지의 시트는 내보내지 않는다.
  // (삭제된 스테이지 시트가 옛 워크북에 남아 있다가 export로 폴더째 되살아나는 사고 차단)
  const registered = new Set(readStagesRows().map((r) => r.id));
  let n = 0, skippedStale = [];
  for (const ws of wb.worksheets) {
    const sheet = ws.name;
    if (sheet.startsWith("_") || sheet.endsWith("_Info")) continue;
    const rel = sheetToRel(sheet);
    const stage = dirname(rel) === "." ? "" : dirname(rel).replace(/\\/g, "/");
    if (stage && !registered.has(stage)) { skippedStale.push(sheet); continue; }
    const meta = SCHEMA[tableOf(basename(rel))];
    // 시트 → AOA
    const aoa = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        let v = cell.value;
        if (v == null) v = "";
        else if (typeof v === "object") {
          if (v.richText) v = v.richText.map(rt => rt.text).join("");
          else if (v.text) v = v.text;
          else if (v.hyperlink) v = v.text;
          else if (v.result !== undefined) v = v.result;
        }
        cells.push(String(v));
      });
      aoa.push(cells);
    });
    let rows = aoa;
    if (meta) {
      const keys = new Set(meta.cols.map((c) => c.key));
      let keyRowIdx = 0, best = -1;
      aoa.forEach((r, i) => { const c = r.filter((x) => keys.has(String(x).trim())).length; if (c > best) { best = c; keyRowIdx = i; } });
      const header = aoa[keyRowIdx].map((c) => String(c).trim());
      const keep = header.map((h, i) => (keys.has(h) ? i : -1)).filter((i) => i >= 0);
      rows = aoa.map((r) => keep.map((i) => (r?.[i] ?? "")));
    }
    // 드롭다운/조건부서식이 깔린 버퍼 행(BUFFER_ROWS)이 빈 행으로 섞여 나오므로,
    // 셀이 전부 빈 행은 버린다. 헤더 3행은 비어있지 않아 그대로 남는다.
    // 남는 행은 keep로 헤더 폭(N열)에 맞춰진 사각형 — 후행 콤마를 자르지 않아야
    // 원본(사각형) 규약과 일치하고 round-trip이 안정적이다.
    rows = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    let csv = rows.map((r) => toLine(r.map((c) => String(c ?? "")))).join("\n");
    csv = csv.replace(/\n+$/, "\n");
    if (!csv.endsWith("\n")) csv += "\n";
    const outPath = join(DATA_DIR, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    if (writeSafe(outPath, BOM + csv, rel)) { console.log(`  ← ${rel}`); n++; }
  }
  if (skippedStale.length) {
    console.warn(`\n  ! 건너뜀(미등록 스테이지 시트 ${skippedStale.length}개): ${skippedStale.join(", ")}`);
    console.warn(`    stages.csv에 없는 스테이지예요 — 워크북이 옛날 거예요. \`npm run data:import\`로 새로 그리세요.`);
  }
  console.log(`\n${n}개 시트 → CSV (UTF-8 BOM, 스키마 컬럼만, 헬퍼열 제거).`);
}

// ───────── 스테이지 관리 (v2: 전역 root + 스테이지 폴더) ─────────
// 3행 헤더(한글/key/type)를 스키마에서 생성. dataRows는 이미 셀 배열들.
function headerRows(table) {
  const m = SCHEMA[table];
  if (!m) throw new Error(`스키마 없음: ${table}`);
  return [m.cols.map((c) => c.ko), m.cols.map((c) => c.key), m.cols.map((c) => c.type)];
}
function emitCsv(path, table, dataRows = []) {
  const rows = [...headerRows(table), ...dataRows];
  writeFileSync(path, BOM + rows.map(toLine).join("\n") + "\n", "utf8");
}
// stages.csv를 읽어 행(객체) 배열로. 전역 root에 있다.
function readStagesRows() {
  const path = join(DATA_DIR, "stages.csv");
  if (!existsSync(path)) return [];
  const aoa = stripBom(readFileSync(path, "utf8")).split(/\r?\n/).filter((l) => l.trim() !== "").map(parseLine);
  const keys = SCHEMA.stages.cols.map((c) => c.key);
  return aoa.slice(3).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}
function writeStagesRows(rows) {
  const keys = SCHEMA.stages.cols.map((c) => c.key);
  emitCsv(join(DATA_DIR, "stages.csv"), "stages", rows.map((r) => keys.map((k) => r[k] ?? "")));
}

function cmdStageList() {
  const rows = readStagesRows();
  if (!rows.length) { console.log("등록된 스테이지 없음 (stages.csv)"); return; }
  console.log("스테이지 목록 (stages.csv):");
  for (const r of rows) {
    const dir = join(DATA_DIR, r.id);
    console.log(`  ${r.icon ?? ""} ${r.id}  — ${r.name}  [${existsSync(dir) ? "폴더 OK" : "⚠ 폴더 없음"}] ${r.config_path}`);
  }
}

async function cmdStageNew(id) {
  if (!id) { console.error("사용법: stage:new <id>"); process.exit(1); }
  if (!/^[A-Za-z0-9_]+$/.test(id)) { console.error("스테이지 id는 영문/숫자/_만 권장"); process.exit(1); }
  const dir = join(DATA_DIR, id);
  if (existsSync(dir)) { console.error(`이미 있음: ${relative(ROOT, dir)}`); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  // 최소 부팅 가능한 골격: start/goal 타일 2칸 + 잇는 엣지. 나머지 필수 표는 헤더만.
  emitCsv(join(dir, "config.csv"), "config", [
    ["start_tile", "t_00"], ["goal_tile", "t_01"], ["board_name", id], ["dice_sides", "6"], ["generator", "weighted"],
  ]);
  emitCsv(join(dir, "tiles.csv"), "tiles", [
    ["t_00", "0", "0", "start", "", "", "default", "1", "시작", ""],
    ["t_01", "1", "0", "goal", "", "", "default", "1", "도착", ""],
  ]);
  emitCsv(join(dir, "edges.csv"), "edges", [["100001", "t_00", "t_01", "", ""]]);
  for (const t of ["events", "choices", "effects", "conditions", "tile_events"]) emitCsv(join(dir, t + ".csv"), t);
  // stages.csv 등록
  const rows = readStagesRows();
  if (rows.some((r) => r.id === id)) console.log(`  (stages.csv에 ${id} 이미 있음 — 폴더만 생성)`);
  else {
    rows.push({ id, name: id, description: "새 스테이지", config_path: `/resources/data/${id}/`, unlock_cost: "0", icon: "🎲" });
    writeStagesRows(rows);
  }
  console.log(`+ 스테이지 생성: ${relative(ROOT, dir)} (config/tiles/edges + 필수 표 골격) + stages.csv 등록`);
  console.log(`  전역 표(stats/generation/assets/derived)는 data/ 루트를 공유합니다 — 따로 만들지 마세요.`);
  console.log(`\n워크북 재생성(새 스테이지 시트 반영) …`);
  await cmdImport();
}

async function cmdStageRm(id) {
  if (!id) { console.error("사용법: stage:rm <id>"); process.exit(1); }
  const dir = join(DATA_DIR, id);
  if (existsSync(dir)) { rmSync(dir, { recursive: true, force: true }); console.log(`- 폴더 삭제: ${relative(ROOT, dir)}`); }
  const rows = readStagesRows();
  const next = rows.filter((r) => r.id !== id);
  if (next.length !== rows.length) { writeStagesRows(next); console.log(`- stages.csv에서 ${id} 제거`); }
  else console.log(`  (stages.csv에 ${id} 없음)`);
  console.log(`\n워크북 재생성(삭제된 스테이지 시트 정리) …`);
  await cmdImport();
}

// ───────── 선택 표 관리 (스테이지 폴더에 표 추가/삭제) ─────────
// 필수 표 = stage:new가 까는 8종(없으면 게임이 부팅 못 함). 나머지 스테이지 표가 "선택 표".
const STAGE_REQUIRED = ["config", "tiles", "edges", "events", "choices", "effects", "conditions", "tile_events"];
const optionalStageTables = () => STAGE_TABLES.filter((t) => !STAGE_REQUIRED.includes(t));

async function cmdTableAdd(stage, table) {
  if (!stage || !table) {
    console.error("사용법: table:add <스테이지id> <표이름>");
    console.error(`  선택 표: ${optionalStageTables().join(", ")}`);
    process.exit(1);
  }
  const dir = join(DATA_DIR, stage);
  if (!existsSync(dir)) { console.error(`스테이지 폴더 없음: ${relative(ROOT, dir)} — stage:new로 먼저 만드세요.`); process.exit(1); }
  if (!STAGE_TABLES.includes(table)) {
    console.error(`'${table}'은(는) 스테이지 표가 아니에요. 가능한 표: ${STAGE_TABLES.join(", ")}`);
    console.error(`  (전역 표 ${GLOBAL_TABLES.join("/")}는 data/ 루트 한 벌을 공유 — 스테이지에 두지 않아요.)`);
    process.exit(1);
  }
  const path = join(dir, `${table}.csv`);
  if (existsSync(path)) { console.error(`이미 있음: ${relative(ROOT, path)}`); process.exit(1); }
  emitCsv(path, table);   // 3행 헤더(한글/key/type)만 — 행은 워크북이나 CSV에서 채운다
  console.log(`+ 표 생성: ${relative(ROOT, path)} (헤더만 — 빈 표는 기능 꺼짐과 동일해 게임에 무해)`);
  console.log(`\n워크북 재생성(새 시트 반영) …`);
  await cmdImport();
}

async function cmdTableRm(stage, table) {
  if (!stage || !table) { console.error("사용법: table:rm <스테이지id> <표이름>"); process.exit(1); }
  if (STAGE_REQUIRED.includes(table)) {
    console.error(`'${table}'은(는) 필수 표라 지울 수 없어요(게임 부팅에 필요). 삭제 가능한 선택 표: ${optionalStageTables().join(", ")}`);
    process.exit(1);
  }
  if (!STAGE_TABLES.includes(table)) { console.error(`'${table}'은(는) 스테이지 표가 아니에요. 선택 표: ${optionalStageTables().join(", ")}`); process.exit(1); }
  const path = join(DATA_DIR, stage, `${table}.csv`);
  if (!existsSync(path)) { console.error(`파일 없음: ${relative(ROOT, path)}`); process.exit(1); }
  rmSync(path);
  console.log(`- 표 삭제: ${relative(ROOT, path)}`);
  console.log(`\n워크북 재생성(시트 정리) …`);
  await cmdImport();
}

// ───────── i18n 번역 파이프라인 (strings 추출/빌드) ─────────
const TYPE_TOK = new Set(["int", "integer", "float", "double", "number", "string", "str", "bool", "boolean"]);
// CSV → {header(키행), rows(키→값 객체 배열)}. 3행 헤더(한글/키/타입) 자동 감지. 게임 파서와 동일 규약.
function readObjs(path) {
  if (!existsSync(path)) return { header: [], rows: [] };
  const lines = stripBom(readFileSync(path, "utf8")).split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  if (lines.length === 0) return { header: [], rows: [] };
  const third = lines[2] ? parseLine(lines[2]).map((c) => c.trim()).filter(Boolean) : [];
  const three = lines.length >= 3 && third.length > 0 && third.every((c) => TYPE_TOK.has(c.toLowerCase()));
  const keyIdx = three ? 1 : 0, dataStart = three ? 3 : 1;
  const header = parseLine(lines[keyIdx]).map((c) => c.trim());
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = parseLine(lines[i]); const o = {};
    header.forEach((h, j) => (o[h] = (cells[j] ?? "").trim()));
    rows.push(o);
  }
  return { header, rows };
}
const stageDirsWithConfig = () =>
  readdirSync(DATA_DIR).map((n) => join(DATA_DIR, n))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "config.csv")));

// 데이터 텍스트 + 코드 tu() 기본값을 훑어 {key → ko} 카탈로그를 만든다(엔진 키 형식 일치).
function collectStrings() {
  const cat = new Map();   // key → ko (첫 비어있지 않은 값 우선)
  const put = (key, val) => { const v = (val ?? "").trim(); if (v && !cat.has(key)) cat.set(key, v); };
  const stages = stageDirsWithConfig();

  // 표별 텍스트 (TEXT_COLS). global(stats/stages/meta)은 루트, 나머지는 각 스테이지.
  const fromTable = (dir, table) => {
    const cols = TEXT_COLS[table]; if (!cols) return;
    const kt = STRING_KEY_TABLE[table] ?? table;
    const { rows } = readObjs(join(dir, table + ".csv"));
    if (table === "config") {                          // key/value: id=스테이지, 컬럼=설정 키
      const stage = basename(dir);
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      for (const c of cols) put(`config_${stage}_${c}`, map[c]);
    } else if (table === "choices") {                  // id = <event_id>_<choice_id>
      for (const r of rows) put(`choices_${r.event_id}_${r.choice_id}_text`, r.text);
    } else if (table === "effects") {                  // kind=MSG 행의 value만
      for (const r of rows) if (r.kind === "MSG") put(`effects_${r.id}_value`, r.value);
    } else {                                           // 표준: <키표>_<id>_<col>
      for (const r of rows) for (const c of cols) put(`${kt}_${r.id}_${c}`, r[c]);
    }
  };
  // global 표
  for (const t of ["stats", "stages", "meta"]) fromTable(DATA_DIR, t);
  // 스테이지 표
  for (const dir of stages) for (const t of ["config", "events", "choices", "effects", "endings", "characters", "enemies", "items"]) fromTable(dir, t);

  // UI: 코드의 tu("id","기본값") 스캔 → UI_<id> = 기본값
  const srcFiles = findCsvFiles; // (이름 충돌 방지용 노op)
  void srcFiles;
  const scanDir = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) scanDir(full);
      else if (name.endsWith(".ts")) {
        const txt = readFileSync(full, "utf8");
        const re = /tu\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
        let m; while ((m = re.exec(txt))) put(`UI_${m[1]}`, m[2].replace(/\\"/g, '"'));
      }
    }
  };
  scanDir(join(ROOT, "src"));

  // ui.csv 텍스트 키(app_name 등): 코드 tu()의 기본값이 동적(ui값)이라 스캔에 안 잡히므로 여기서 ko를 채운다.
  const uiRows = readObjs(join(DATA_DIR, "ui.csv")).rows;
  const uiMap = Object.fromEntries(uiRows.map((r) => [r.key, r.value]));
  for (const k of UI_TEXT_KEYS) put(`UI_${k}`, uiMap[k]);

  return cat;
}

function cmdStrings() {
  const cat = collectStrings();
  const path = join(DATA_DIR, "strings.csv");
  // 기존 번역(추가 언어 컬럼) 보존: 살아남은 키의 ko 외 컬럼을 다시 붙인다.
  const prev = readObjs(path);
  const langCols = prev.header.filter((h) => h !== "key" && h !== "ko");
  const prevByKey = new Map(prev.rows.map((r) => [r.key, r]));
  const newKeys = new Set(cat.keys());
  const added = [...newKeys].filter((k) => !prevByKey.has(k));
  const removed = prev.rows.map((r) => r.key).filter((k) => k && !newKeys.has(k));

  const cols = ["key", "ko", ...langCols];
  const koLabel = { key: "키", ko: "한국어(ko)" };
  const headerKo = cols.map((c) => koLabel[c] ?? c.toUpperCase());
  const lines = [headerKo, cols, cols.map(() => "string")];
  for (const [key, ko] of cat) {
    const prevRow = prevByKey.get(key) ?? {};
    lines.push(cols.map((c) => (c === "key" ? key : c === "ko" ? ko : prevRow[c] ?? "")));
  }
  writeSafe(path, BOM + lines.map(toLine).join("\n") + "\n", "strings.csv");
  console.log(`strings.csv: 키 ${cat.size}개 (신규 ${added.length} · 사라짐 ${removed.length}) · 언어 컬럼 [ko${langCols.length ? ", " + langCols.join(", ") : ""}]`);
  if (added.length) console.log(`  + ${added.slice(0, 8).join(", ")}${added.length > 8 ? " …" : ""}`);
  if (removed.length) console.log(`  - 제거됨(번역도 함께 사라짐): ${removed.slice(0, 8).join(", ")}${removed.length > 8 ? " …" : ""}`);
}

function cmdStringsBuild() {
  const path = join(DATA_DIR, "strings.csv");
  if (!existsSync(path)) { console.error("strings.csv 없음 — 먼저 `strings`로 추출하세요."); process.exit(1); }
  const { header, rows } = readObjs(path);
  const langs = header.filter((h) => h !== "key" && h !== "ko");   // ko는 인라인 기본이라 빌드 안 함
  if (langs.length === 0) { console.log("빌드할 언어 컬럼 없음(ko만 있음). strings.csv에 en 등 컬럼을 추가하세요."); return; }
  for (const lang of langs) {
    const obj = {};
    for (const r of rows) if (r.key && (r[lang] ?? "").trim()) obj[r.key] = r[lang].trim();
    const out = join(DATA_DIR, `strings_${lang}.json`);
    writeSafe(out, JSON.stringify(obj, null, 0), `strings_${lang}.json`);
    console.log(`  → strings_${lang}.json (${Object.keys(obj).length}개 번역)`);
  }
}

const cmd = process.argv[2];
if (cmd === "migrate") cmdMigrate();
else if (cmd === "bom") cmdBom();
else if (cmd === "import") cmdImport();
else if (cmd === "export") cmdExport(process.argv[3] || "master");
else if (cmd === "stage:list") cmdStageList();
else if (cmd === "stage:new") cmdStageNew(process.argv[3]);
else if (cmd === "stage:rm") cmdStageRm(process.argv[3]);
else if (cmd === "table:add") cmdTableAdd(process.argv[3], process.argv[4]);
else if (cmd === "table:rm") cmdTableRm(process.argv[3], process.argv[4]);
else if (cmd === "strings") cmdStrings();
else if (cmd === "strings:build") cmdStringsBuild();
else { console.log("사용법: node tools/csv-sync.mjs <migrate|bom|import|export [master|map|narrative|entity|setup]|stage:list|stage:new <id>|stage:rm <id>|table:add <스테이지> <표>|table:rm <스테이지> <표>|strings|strings:build>"); process.exit(1); }
