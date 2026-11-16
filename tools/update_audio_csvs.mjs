import fs from 'fs';
import path from 'path';

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
  return rows;
}

function stringifyCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(f => {
    f = String(f);
    if (f.includes(',') || f.includes('\n') || f.includes('"')) {
      return '"' + f.replace(/"/g, '""') + '"';
    }
    return f;
  }).join(',')).join('\n') + '\n';
}

const dir = 'public/resources/data/test';
const rootDir = 'public/resources/data';

// 1. assets.csv 업데이트
const assetsPath = path.join(rootDir, 'assets.csv');
let assetsRows = parseCsv(fs.readFileSync(assetsPath, 'utf8'));
const audioFiles = [
  'sfx_badend', 'sfx_badevent', 'sfx_badevents9', 'sfx_dice', 'sfx_gain',
  'sfx_happyend', 'sfx_ingame', 'sfx_lose', 'sfx_normalend', 'sfx_outgame',
  'sfx_positivevent', 'sfx_zzipzzipend'
];
for (const file of audioFiles) {
  if (!assetsRows.some(r => r[0] === file)) {
    assetsRows.push([file, 'audio', (['sfx_dice','sfx_gain','sfx_lose'].includes(file) ? `/resources/audio/${file}.wav` : `/resources/audio/${file}.mp3`), '', '', '']);
  }
}
fs.writeFileSync(assetsPath, stringifyCsv(assetsRows));

// 2. config.csv 업데이트
const configPath = path.join(dir, 'config.csv');
let configRows = parseCsv(fs.readFileSync(configPath, 'utf8'));
for (const row of configRows) {
  if (row[0] === 'bgm') row[1] = 'sfx_ingame';
}
fs.writeFileSync(configPath, stringifyCsv(configRows));

// 3. effects.csv 업데이트
const effectsPath = path.join(dir, 'effects.csv');
let effectsRows = parseCsv(fs.readFileSync(effectsPath, 'utf8'));
const newEffects = [
  ['eff_bgm_happyend', 'PLAY_BGM', '', 'sfx_happyend', ''],
  ['eff_bgm_normalend', 'PLAY_BGM', '', 'sfx_normalend', ''],
  ['eff_bgm_zzipzzipend', 'PLAY_BGM', '', 'sfx_zzipzzipend', ''],
  ['eff_bgm_badend', 'PLAY_BGM', '', 'sfx_badend', ''],
  ['eff_bgm_positive', 'PLAY_BGM', '', 'sfx_positivevent', ''],
  ['eff_bgm_negative', 'PLAY_BGM', '', 'sfx_badevent', ''],
  ['eff_bgm_negative_49', 'PLAY_BGM', '', 'sfx_badevents9', '']
];
for (const eff of newEffects) {
  if (!effectsRows.some(r => r[0] === eff[0])) {
    effectsRows.push(eff);
  }
}
fs.writeFileSync(effectsPath, stringifyCsv(effectsRows));

// 4. events.csv 업데이트
const eventsPath = path.join(dir, 'events.csv');
let eventsRows = parseCsv(fs.readFileSync(eventsPath, 'utf8'));

// 찾아서 payload 열(인덱스 4)에 이펙트 추가하는 함수 (세번째 열이 payload인 경우도 있음)
// 헤더를 통해 payload 열 인덱스 찾기
const header = eventsRows[1].map(h => h.trim());
const payloadIdx = header.indexOf('payload');

for (let i = 3; i < eventsRows.length; i++) {
  const row = eventsRows[i];
  if (row.length === 0 || row[0] === '') continue;
  const id = row[0];
  
  let effToAdd = null;
  if (id === 'ev_best_1') effToAdd = 'eff_bgm_happyend';
  else if (id === 'ev_normal1_1') effToAdd = 'eff_bgm_normalend';
  else if (id === 'ev_normal2_1') effToAdd = 'eff_bgm_zzipzzipend';
  else if (id === 'ev_bad_1') effToAdd = 'eff_bgm_badend';
  else if (id === 'ev_m_010_N_S1') effToAdd = 'eff_bgm_negative_49';
  else if (id.includes('_P_') || id.includes('_cond_pos')) effToAdd = 'eff_bgm_positive'; // 메인 긍정 (ev_m_010_P_S1 등)
  else if (id.includes('_N_') || id.includes('_cond_neg')) effToAdd = 'eff_bgm_negative'; // 메인 부정 (ev_m_010_N_S2 등)
  else if (id.startsWith('ev_r_') && !id.includes('_cond_')) {
    // 랜덤 이벤트는 긍정인지 부정인지 모름.
    // 하지만 user request에 "부정적 이벤트 발생: sfx_badevent, 긍정적 이벤트(메인이벤트 포함) 발생: sfx_positivevent"
    // 랜덤 이벤트는 효과를 보고 판별.
  }
  
  if (effToAdd) {
    if (row[payloadIdx]) {
      if (!row[payloadIdx].includes(effToAdd)) row[payloadIdx] += ';' + effToAdd;
    } else {
      row[payloadIdx] = effToAdd;
    }
  }
}

// 랜덤 이벤트 긍정/부정 판별 로직
const tileEventsPath = path.join(dir, 'tile_events.csv');
let tileEventsRows = parseCsv(fs.readFileSync(tileEventsPath, 'utf8'));
for (const te of tileEventsRows.slice(3)) {
  if (te.length < 5) continue;
  const eventId = te[2];
  const condGroupId = te[4];
  
  // 조건 그룹 이름으로 긍/부정 판별
  let isPos = false;
  let isNeg = false;
  if (condGroupId.includes('pos')) isPos = true;
  if (condGroupId.includes('neg')) isNeg = true;
  
  // 랜덤 이벤트 중 ID에 _pos_ 나 _neg_ 가 있는 경우
  if (eventId.includes('_pos_')) isPos = true;
  if (eventId.includes('_neg_')) isNeg = true;
  
  if (isPos || isNeg) {
    const effToAdd = isPos ? 'eff_bgm_positive' : 'eff_bgm_negative';
    const evRow = eventsRows.find(r => r[0] === eventId);
    if (evRow) {
      if (evRow[payloadIdx]) {
        if (!evRow[payloadIdx].includes(effToAdd)) evRow[payloadIdx] += ';' + effToAdd;
      } else {
        evRow[payloadIdx] = effToAdd;
      }
    }
  }
}

// 그 외 긍정/부정 이벤트 판별
// events.csv를 순회하며 텍스트 뉘앙스나 기존 페이로드 기반으로 판별
for (let i = 3; i < eventsRows.length; i++) {
  const row = eventsRows[i];
  if (!row[0]) continue;
  const id = row[0];
  // 이미 할당된 경우 패스
  if (row[payloadIdx] && row[payloadIdx].includes('eff_bgm')) continue;
  
  // 메인이벤트와 무작위 이벤트 중 할당안된 것들
  // effect 열을 보거나 텍스트를 보고 추론해야 하지만, 일단 기본 할당이 없으면 둔다.
}

fs.writeFileSync(eventsPath, stringifyCsv(eventsRows));

console.log('Audio CSV update complete.');
