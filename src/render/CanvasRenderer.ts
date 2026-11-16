import type { Board, Tile } from "../core/Board";

// 보드를 그리드 좌표로 받아 화면에 맞춰 자동 스케일.
// 타입별 색상 팔레트 — 이미지 자산은 후속 마일스톤에서 sprite 필드 활용해 부착.

const REGION_BG: Record<string, string> = {
  // demo
  forest:   "#27402d",
  town:     "#3a3a55",
  // hero
  kingdom:  "#3a3520",
  mountain: "#2d333d",
  dungeon:  "#2a1f35",
  castle:   "#4a2a2a",
  default:  "#2c333d",
};

const TYPE_FG: Record<string, string> = {
  start:    "#7be38a",
  goal:     "#ffd66b",
  shop:     "#88c8ff",
  shrine:   "#d6a8ff",
  hazard:   "#ff7a7a",
  boon:     "#a8ffb8",
  trap:     "#ff9966",
  event:    "#ffd6a8",
  shortcut: "#66ffcc",
  setback:  "#ff66aa",
  empty:    "#9aa3b2",
  // VN Board Types
  main:     "#ffd66b", // 메인 이벤트 (금색)
  positive: "#7be38a", // 긍정 이벤트 (초록)
  negative: "#ff7a7a", // 부정 이벤트 (빨강)
  ending:   "#d6a8ff", // 엔딩 이벤트 (보라)
};

const TYPE_BG: Record<string, string> = {
  main:     "#ffd66b", // 금색
  positive: "#3b5e43", // 짙은 초록 (기본 타일)
  negative: "#ff7a7a", // 빨강
  ending:   "#d6a8ff", // 보라
};

// 보드 외형 — config로 덮어쓸 수 있는 값들(빈 값은 기본 유지). GameScene이 config에서 채운다.
export interface BoardStyle {
  boardBg: string;        // 캔버스 배경
  edgeColor: string;      // 칸 사이 선 색
  edgeWidth: number;
  tilePad: number;        // 칸 안쪽 여백
  tileRadius: number;     // 칸 모서리 둥글기
  tileBorder: string;     // 칸 테두리 색(빈=없음)
  tileBorderWidth: number;
  lockedBorder: string;   // locked 칸 강조 테두리
  playerColor: string;    // 플레이어 토큰 색(이미지 없을 때)
  enemyColor: string;     // 적 토큰 기본 색(이미지 없을 때)
  tokenStroke: string;    // 토큰 외곽선
  tokenRadius: number;    // 칸 크기 대비 토큰 반지름 비율(0~0.5)
  labelMode: string;      // 칸 하단 라벨: full=label∥id(기존) | short=label 있는 칸만 | none=숨김
  typeLabel: boolean;     // 칸 상단 타입 텍스트 표시
}

export const DEFAULT_STYLE: BoardStyle = {
  boardBg: "#1a1d22", edgeColor: "#4a525e", edgeWidth: 2,
  tilePad: 4, tileRadius: 8, tileBorder: "", tileBorderWidth: 1,
  lockedBorder: "#ffd66b", playerColor: "#3a82f7", enemyColor: "#e8443a",
  tokenStroke: "#ffffff", tokenRadius: 0.18,
  labelMode: "full", typeLabel: true,
};

// 카메라/맞춤 한계 — UiSettings(board_* 키)에서 채워진다. 기본값은 기존 하드코딩 값과 동일.
export interface CameraOpts {
  zoomMin: number;
  zoomMax: number;
  fitPadding: number;
  cellMin: number;
  cellMax: number;
}

export const DEFAULT_CAMERA: CameraOpts = { zoomMin: 0.5, zoomMax: 3, fitPadding: 24, cellMin: 24, cellMax: 96 };

export class CanvasRenderer {
  private cellPx = 64;
  private offsetX = 0;
  private offsetY = 0;
  // tile.sprite 키 → 로드된 이미지. GameScene이 채운다.
  private sprites: Map<string, HTMLImageElement> = new Map();
  private style: BoardStyle = { ...DEFAULT_STYLE };

  // 카메라: fit()의 자동 맞춤 배율(baseCell) 위에 zoom을 곱하고 pan으로 평행이동.
  // tileToScreen()이 모든 좌표 계산을 독점하므로 토큰/애니메이션이 그대로 따라온다.
  private cam: CameraOpts = { ...DEFAULT_CAMERA };
  private baseCell = 64;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  // 앵커 줌(커서 기준) 계산에 필요한 마지막 fit 정보.
  private lastFit: { w: number; h: number; minX: number; minY: number; cols: number; rows: number } | null = null;

  constructor(private ctx: CanvasRenderingContext2D, private canvas: HTMLCanvasElement) {}

  setSprites(map: Map<string, HTMLImageElement>) { this.sprites = map; }
  // config에서 추출한 부분 스타일을 기본값 위에 덮는다(빈/누락은 기본 유지).
  setStyle(partial: Partial<BoardStyle>) { this.style = { ...DEFAULT_STYLE, ...partial }; }

  setCameraOpts(partial: Partial<CameraOpts>) {
    this.cam = { ...DEFAULT_CAMERA, ...partial };
    this.zoom = this.clampZoom(this.zoom);
  }
  getZoom(): number { return this.zoom; }
  private clampZoom(z: number): number { return Math.max(this.cam.zoomMin, Math.min(this.cam.zoomMax, z)); }

  // 화면 크기에 맞춰 baseCell과 offset 계산. zoom/pan을 합성하고 pan은 보드가 화면에서 사라지지 않게 클램프.
  fit(board: Board, padding = this.cam.fitPadding) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const bb = board.bbox();
    const cols = bb.maxX - bb.minX + 1;
    const rows = bb.maxY - bb.minY + 1;
    const cell = Math.floor(Math.min((w - padding * 2) / cols, (h - padding * 2) / rows));
    this.baseCell = Math.max(this.cam.cellMin, Math.min(cell, this.cam.cellMax));
    this.lastFit = { w, h, minX: bb.minX, minY: bb.minY, cols, rows };

    this.cellPx = this.baseCell * this.zoom;
    const usedW = cols * this.cellPx;
    const usedH = rows * this.cellPx;
    const margin = Math.min(120, Math.min(w, h) / 3);   // 최소 이만큼은 보드가 화면에 남는다
    this.panX = Math.max(margin - usedW - this.centerOff(w, usedW), Math.min(w - margin - this.centerOff(w, usedW), this.panX));
    this.panY = Math.max(margin - usedH - this.centerOff(h, usedH), Math.min(h - margin - this.centerOff(h, usedH), this.panY));
    this.offsetX = this.centerOff(w, usedW) - bb.minX * this.cellPx + this.panX;
    this.offsetY = this.centerOff(h, usedH) - bb.minY * this.cellPx + this.panY;
  }
  private centerOff(viewport: number, used: number): number { return Math.floor((viewport - used) / 2); }

  // 앵커(화면 px) 기준 줌 — 앵커 아래의 보드 지점이 줌 후에도 같은 화면 위치에 남도록 pan 보정.
  zoomBy(factor: number, anchorX?: number, anchorY?: number) {
    if (!this.lastFit) { this.zoom = this.clampZoom(this.zoom * factor); return; }
    const { w, h, minX, minY, cols, rows } = this.lastFit;
    const ax = anchorX ?? w / 2;
    const ay = anchorY ?? h / 2;
    const cell = this.cellPx;
    // 앵커 아래 보드 좌표(타일 단위, minX 보정 전 절대 좌표)
    const tx = (ax - this.offsetX) / cell;
    const ty = (ay - this.offsetY) / cell;
    this.zoom = this.clampZoom(this.zoom * factor);
    const cell2 = this.baseCell * this.zoom;
    const used2W = cols * cell2, used2H = rows * cell2;
    this.panX = ax - tx * cell2 - (this.centerOff(w, used2W) - minX * cell2);
    this.panY = ay - ty * cell2 - (this.centerOff(h, used2H) - minY * cell2);
  }

  panBy(dx: number, dy: number) { this.panX += dx; this.panY += dy; }

  resetCamera(zoom = 1) { this.zoom = this.clampZoom(zoom); this.panX = 0; this.panY = 0; }

  // 특정 타일이 뷰포트 중앙에 오도록 pan 조정(카메라 추적용).
  centerOn(t: Tile) {
    if (!this.lastFit) return;
    const { w, h } = this.lastFit;
    const c = this.tileCenter(t);
    this.panX += w / 2 - c.x;
    this.panY += h / 2 - c.y;
  }

  tileToScreen(t: Tile): { x: number; y: number; size: number } {
    return {
      x: this.offsetX + t.x * this.cellPx,
      y: this.offsetY + t.y * this.cellPx,
      size: this.cellPx,
    };
  }

  draw(board: Board, opts?: {
    playerTileId?: string; playerPos?: { x: number; y: number }; playerSprite?: string;
    enemies?: { tileId: string; pos?: { x: number; y: number }; color?: string; sprite?: string }[];
  }) {
    const { ctx, style } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // 엣지 먼저 (타일 아래)
    ctx.strokeStyle = style.edgeColor;
    ctx.lineWidth = style.edgeWidth;
    for (const [from, outs] of board.outEdges) {
      const a = board.get(from);
      const ap = this.tileToScreen(a);
      const acx = ap.x + ap.size / 2;
      const acy = ap.y + ap.size / 2;
      for (const e of outs) {
        const b = board.get(e.to);
        const bp = this.tileToScreen(b);
        ctx.beginPath();
        ctx.moveTo(acx, acy);
        ctx.lineTo(bp.x + bp.size / 2, bp.y + bp.size / 2);
        ctx.stroke();
      }
    }

    // 타일
    const pad = style.tilePad;
    const rad = style.tileRadius;
    for (const t of board.tiles.values()) {
      const { x, y, size } = this.tileToScreen(t);
      const baseType = t.type ? t.type.split('_')[0] : undefined;
      const bg = (baseType ? TYPE_BG[baseType] : undefined) ?? REGION_BG[t.region] ?? REGION_BG.default;
      ctx.fillStyle = bg;
      this.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, rad);
      ctx.fill();

      // 스프라이트: tile.sprite(id/경로) 우선, 없으면 타입 기본(tile_<type>).
      // 없거나 로드 전이면 색상 박스 유지.
      const spriteKey = t.sprite || (t.type ? `tile_${t.type}` : "");
      const sprite = spriteKey ? this.sprites.get(spriteKey) : undefined;
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        ctx.save();
        this.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, rad);
        ctx.clip();
        ctx.drawImage(sprite, x + pad, y + pad, size - pad * 2, size - pad * 2);
        ctx.restore();
      }

      // 칸 테두리(config tile_border 있을 때만)
      if (style.tileBorder) {
        ctx.strokeStyle = style.tileBorder;
        ctx.lineWidth = style.tileBorderWidth;
        this.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, rad);
        ctx.stroke();
      }

      // 타입 표시 — EMPTY는 옅게, 그 외는 강조색 (tile_type_label=0이면 숨김)
      if (style.typeLabel && t.type && t.type !== "empty") {
        const baseType = t.type.split('_')[0];
        const hasBg = !!TYPE_BG[baseType];
        const color = hasBg ? "#111" : (TYPE_FG[baseType] ?? "#cccccc");
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.floor(size * 0.18)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        let typeText = t.type.toUpperCase();
        if (t.id === "t_49" && typeText === "MAIN_49") typeText = "MAIN";
        
        ctx.fillText(typeText, x + size / 2, y + pad + 4);
      }

      // 라벨/ID — tile_label_mode: full=label∥id, short=label 있는 칸만, none=숨김
      if (style.labelMode !== "none") {
        let lbl = style.labelMode === "short" ? t.label : (t.label ?? t.id);
        if (lbl && lbl.startsWith("t_")) {
          const numMatch = lbl.match(/^t_0*(\d+)$/);
          if (numMatch) {
            lbl = `${numMatch[1]}턴`;
          } else if (lbl === "t_00") {
            lbl = "시작";
          } else if (lbl === "t_50") {
            lbl = "목표";
          }
        }
        if (lbl) {
          const baseType = t.type ? t.type.split('_')[0] : undefined;
          const hasBg = baseType ? !!TYPE_BG[baseType] : false;
          ctx.fillStyle = hasBg ? "#111" : "#cdd3dc";
          ctx.font = `${Math.floor(size * 0.15)}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(lbl, x + size / 2, y + size - pad - 4);
        }
      }

      // locked 표시
      if (t.locked) {
        ctx.strokeStyle = style.lockedBorder;
        ctx.lineWidth = 2;
        this.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, rad);
        ctx.stroke();
      }
    }

    // 적 토큰들 (있으면) — 플레이어 아래에 먼저 그림
    for (const e of opts?.enemies ?? []) {
      this.drawToken(board, e.pos, e.tileId, e.color ?? style.enemyColor, style.tokenStroke, e.sprite);
    }
    // 플레이어 토큰 (config player_sprite 있으면 이미지)
    this.drawToken(board, opts?.playerPos, opts?.playerTileId, style.playerColor, style.tokenStroke, opts?.playerSprite);
  }

  private drawToken(board: Board, pos: { x: number; y: number } | undefined, tileId: string | undefined, fill: string, stroke: string, spriteKey?: string) {
    const { ctx } = this;
    let cx: number | null = null, cy: number | null = null, sz = this.cellPx;
    if (pos) { cx = pos.x; cy = pos.y; }
    else if (tileId) {
      const t = board.tiles.get(tileId);
      if (t) { const { x, y, size } = this.tileToScreen(t); cx = x + size / 2; cy = y + size / 2; sz = size; }
    }
    if (cx === null || cy === null) return;
    const r = sz * Math.max(0.05, Math.min(0.5, this.style.tokenRadius));
    // 스프라이트가 로드돼 있으면 원형으로 클립해 그림, 없으면 색 원.
    const sprite = spriteKey ? this.sprites.get(spriteKey) : undefined;
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(sprite, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = stroke; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 타일 중앙 픽셀 좌표 (애니메이션용 보간 시작/끝점에 사용)
  tileCenter(t: Tile): { x: number; y: number } {
    const { x, y, size } = this.tileToScreen(t);
    return { x: x + size / 2, y: y + size / 2 };
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
