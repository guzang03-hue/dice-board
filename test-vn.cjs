const { resolve } = require('path');
const fs = require('fs');

function td(table, id, column, fallback) { return fallback || ""; }

const eventsCsv = fs.readFileSync('public/resources/data/test/events.csv', 'utf8');
const assetsCsv = fs.readFileSync('public/resources/data/assets.csv', 'utf8');

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') {}
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter(r => r.length > 0 && !(r.length === 1 && r[0].trim() === '') && !(r[0].trim().startsWith('#')));
  const header = clean[1].map(h => h.trim());
  const out = [];
  for (let i = 3; i < clean.length; i++) {
    const r = clean[i];
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = (r[j] ?? '').trim();
    out.push(obj);
  }
  return out;
}

const events = parseCsv(eventsCsv);
const assets = parseCsv(assetsCsv);

const ev = events.find(e => e.id === 'ev_m_010_N_S1');
const title = td("events", ev.id, "title", ev.title || ev.id);
const text = td("events", ev.id, "text", ev.text || "");

const assetMap = new Map();
for(const a of assets) assetMap.set(a.id, a);

function buildVN(ev, title, text) {
  let background;
  let sprites = [];
  let speaker = ev.speaker;
  for (const id of [ev.sprite1, ev.sprite2, ev.sprite3]) {
    if (!id) continue;
    const a = assetMap.get(id);
    sprites.push({ image: a?.path, icon: ev.icon, pos: a?.pos ?? "center" });
    if (!speaker) speaker = a?.speaker;
  }
  return { background, sprites, speaker, title: title === ev.id ? undefined : title, text, choices: [] };
}

const vn = buildVN(ev, title, text);
console.log(JSON.stringify(vn, null, 2));
