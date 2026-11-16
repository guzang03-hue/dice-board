// VN QA용 실제 PNG 생성기 (의존성 0 — Node zlib로 직접 인코딩).
//   node tools/make-vn-pngs.mjs
// 배경 1장(불투명) + 캐릭터 2장(알파 투명)을 public/resources/images/에 쓴다.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "resources", "images");
mkdirSync(OUT, { recursive: true });

// ---- PNG 인코딩 (RGBA, 8bit, filter 0) ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8bit RGBA
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- 픽셀 헬퍼 ----
const mk = (w, h) => Buffer.alloc(w * h * 4);   // 전부 (0,0,0,0) 투명
function set(buf, w, x, y, c) { if (x < 0 || y < 0 || x >= w) return; const i = (y * w + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3] ?? 255; }
function rect(buf, w, h, x0, y0, x1, y1, c) { for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) set(buf, w, x, y, c); }
function disc(buf, w, h, cx, cy, r, c) { for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r * r) set(buf, w, x, y, c); } }
// 아래로 갈수록 넓어지는 사다리꼴(로브)
function robe(buf, w, h, cx, top, bot, wTop, wBot, c) { for (let y = top; y < bot; y++) { const t = (y - top) / (bot - top); const half = (wTop + (wBot - wTop) * t) / 2; rect(buf, w, h, Math.round(cx - half), y, Math.round(cx + half), y + 1, c); } }
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// 기존(불투명) 픽셀 위에 색을 a(0..1)만큼 섞는다 — 옅은 무늬용(알파 덮어쓰기 X).
function blend(buf, w, h, x, y, r, g, b, a) { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; buf[i] = Math.round(buf[i] * (1 - a) + r * a); buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a); buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a); buf[i + 3] = 255; }
function blendRect(buf, w, h, x0, y0, x1, y1, r, g, b, a) { for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) blend(buf, w, h, x, y, r, g, b, a); }
function blendDisc(buf, w, h, cx, cy, rad, r, g, b, a) { for (let y = Math.max(0, cy - rad); y < Math.min(h, cy + rad); y++) for (let x = Math.max(0, cx - rad); x < Math.min(w, cx + rad); x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= rad * rad) blend(buf, w, h, x, y, r, g, b, a); } }

// ---- 1) 배경: 옥좌의 방 (480x270, 불투명) ----
function makeThrone() {
  const w = 480, h = 270, buf = mk(w, h);
  for (let y = 0; y < h; y++) {                    // 세로 그라데이션 (자주빛→짙은 적색)
    const t = y / h;
    const c = [lerp(38, 92, t), lerp(18, 26, t), lerp(52, 28, t), 255];
    rect(buf, w, h, 0, y, w, y + 1, c);
  }
  rect(buf, w, h, 0, h - 46, w, h, [22, 12, 18, 255]);              // 바닥
  robe(buf, w, h, w / 2, 70, h - 40, 80, 150, [58, 26, 40, 255]);   // 가운데 옥좌(어두운 적색 사다리꼴)
  rect(buf, w, h, w / 2 - 60, 60, w / 2 + 60, 80, [246, 201, 72, 255]); // 옥좌 등받이 금테
  for (const x of [60, 180, 300, 420]) rect(buf, w, h, x, 30, x + 10, h - 40, [70, 40, 60, 255]); // 기둥
  return encodePNG(w, h, buf);
}

// ---- 캐릭터 공통: 머리+로브, 색만 다르게 (240x360, 투명) ----
function makeChar({ robeC, hatC, hatKind }) {
  const w = 240, h = 360, buf = mk(w, h), cx = w / 2;
  robe(buf, w, h, cx, 150, 348, 70, 190, robeC);          // 로브
  rect(buf, w, h, cx - 95, 300, cx - 35, 348, robeC);     // 소매(좌)
  rect(buf, w, h, cx + 35, 300, cx + 95, 348, robeC);     // 소매(우)
  disc(buf, w, h, cx, 110, 46, [232, 188, 150, 255]);     // 머리
  disc(buf, w, h, cx - 16, 104, 5, [40, 30, 30, 255]);    // 눈
  disc(buf, w, h, cx + 16, 104, 5, [40, 30, 30, 255]);
  rect(buf, w, h, cx - 12, 126, cx + 12, 130, [120, 60, 60, 255]); // 입
  if (hatKind === "crown") {                              // 왕관(금색 톱니)
    rect(buf, w, h, cx - 44, 56, cx + 44, 72, hatC);
    for (const dx of [-44, -22, 0, 22, 36]) rect(buf, w, h, cx + dx, 40, cx + dx + 14, 58, hatC);
  } else {                                                // 광대모자(양쪽 뿔)
    robe(buf, w, h, cx - 30, 50, 78, 8, 40, hatC);
    robe(buf, w, h, cx + 30, 50, 78, 8, 40, hatC);
    disc(buf, w, h, cx - 44, 50, 8, [240, 80, 80, 255]);
    disc(buf, w, h, cx + 44, 50, 8, [240, 80, 80, 255]);
  }
  return encodePNG(w, h, buf);
}

// ---- UI 데모: 시작화면 배경 (960x540, 불투명, 옅은 주사위 무늬) ----
function makeMenuBg() {
  const w = 960, h = 540, buf = mk(w, h);
  for (let y = 0; y < h; y++) {                    // 대각 느낌 세로 그라데이션(짙은 남보라)
    const t = y / h;
    rect(buf, w, h, 0, y, w, y + 1, [lerp(28, 16, t), lerp(24, 18, t), lerp(44, 26, t), 255]);
  }
  // 흩뿌린 주사위(둥근 사각 + 점) — 아주 옅게 블렌딩해 글자 가독성 유지
  for (const [cx, cy, s] of [[150, 130, 80], [780, 90, 60], [320, 430, 100], [860, 440, 70], [560, 270, 52]]) {
    blendRect(buf, w, h, cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, 255, 255, 255, 0.05);
    const pr = Math.max(3, Math.round(s * 0.07));
    for (const [px, py] of [[0, 0], [-0.26, -0.26], [0.26, 0.26]])
      blendDisc(buf, w, h, Math.round(cx + px * s), Math.round(cy + py * s), pr, 255, 255, 255, 0.12);
  }
  return encodePNG(w, h, buf);
}

writeFileSync(join(OUT, "vn_bg_throne.png"), makeThrone());
writeFileSync(join(OUT, "vn_char_king.png"), makeChar({ robeC: [122, 31, 43, 255], hatC: [246, 201, 72, 255], hatKind: "crown" }));
writeFileSync(join(OUT, "vn_char_jester.png"), makeChar({ robeC: [46, 125, 79, 255], hatC: [106, 61, 138, 255], hatKind: "jester" }));
writeFileSync(join(OUT, "ui_bg_menu.png"), makeMenuBg());
console.log("PNG 생성 완료:", ["vn_bg_throne.png", "vn_char_king.png", "vn_char_jester.png", "ui_bg_menu.png"].join(", "));
