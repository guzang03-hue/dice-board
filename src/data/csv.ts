// 경량 CSV 파서. 쌍따옴표 이스케이프(""), 따옴표 안 콤마/개행 지원. BOM 제거.
// 외부 라이브러리 없이 일관된 동작이 목표 — 게임 데이터 크기에 충분하다.
//
// 헤더 규약(스키마): 사람이 읽기 쉽게 3행 헤더를 쓴다.
//   1행 = 한글 표시명, 2행 = 변수명(키), 3행 = 타입, 4행~ = 데이터
// 단일 헤더(구버전)도 자동 감지해 그대로 동작한다 — 3행째가 '타입 행'처럼
// 보이면 3행 헤더로, 아니면 1행 헤더로 해석한다.

export type CsvRow = Record<string, string>;

const TYPE_TOKENS = new Set(["int", "integer", "float", "double", "number", "string", "str", "bool", "boolean"]);

// 행의 모든 비어있지 않은 셀이 타입 토큰이면 '타입 행'으로 본다.
function looksLikeTypeRow(cells: string[]): boolean {
  const nonEmpty = cells.map(c => c.trim()).filter(c => c !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every(c => TYPE_TOKENS.has(c.toLowerCase()));
}

export function parseCsv(text: string): CsvRow[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  // 빈 줄·주석(#로 시작) 제거.
  const clean = rows.filter(r => r.length > 0 && !(r.length === 1 && r[0].trim() === "") && !(r[0].trim().startsWith("#")));
  if (clean.length === 0) return [];

  // 3행 헤더 감지: 3번째 행이 타입 행처럼 보이면 (1행=한글, 2행=키, 3행=타입).
  const threeRow = clean.length >= 3 && looksLikeTypeRow(clean[2]);
  const keyRowIdx = threeRow ? 1 : 0;
  const dataStartIdx = threeRow ? 3 : 1;

  const header = clean[keyRowIdx].map(h => h.trim());
  const out: CsvRow[] = [];
  for (let i = dataStartIdx; i < clean.length; i++) {
    const r = clean[i];
    const obj: CsvRow = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = (r[j] ?? "").trim();
    out.push(obj);
  }
  return out;
}
