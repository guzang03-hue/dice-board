// localStorage 기반 세이브/로드.
// RunSave: 현재 진행 중인 런. MetaSave: 런 간 영구 누적.

export interface RunSave {
  version: number;          // 호환성용
  slot?: number;            // 저장 슬롯 (0..N-1)
  stageId: string;
  seed: string | number;
  playerTileId: string;
  resources: Record<string, number>;  // id → value
  flags: Record<string, unknown>;
  turnCount: number;
  savedAt: number;          // Date.now()
  characterId?: string;     // 선택한 캐릭터 id (characters.csv 사용 시). 복원 시 포트레이트/이름 유지
  statuses?: Record<string, { remaining: number; stacks: number }>;  // 활성 지속 상태
  enemies?: Record<string, { tileId: string; stun: number; alive: boolean; activated?: boolean }>;  // 적 런타임 상태
  inventory?: Record<string, number>;  // 보유 아이템 (item id → 수량)
}

export const SAVE_SLOTS = 3;

export interface MetaSave {
  version: number;
  points: number;           // 누적 메타 포인트
  ranks: Record<string, number>;  // upgrade id → 현재 랭크
  unlockedStages: string[]; // 해금된 스테이지 id 목록
  clearedStages: string[];  // 클리어한 스테이지 id 목록
}

const RUN_KEY = "dice-board-run";          // 구버전(단일) 키 — 슬롯 0으로 이관
const META_KEY = "dice-board-meta";
const VERSION = 1;

const runKey = (slot: number) => `dice-board-run-${slot}`;

export class SaveManager {
  constructor() { this.migrateLegacyRun(); }

  // 구버전 단일 세이브 → 슬롯 0으로 이관
  private migrateLegacyRun() {
    try {
      const old = localStorage.getItem(RUN_KEY);
      if (old && !localStorage.getItem(runKey(0))) {
        localStorage.setItem(runKey(0), old);
        localStorage.removeItem(RUN_KEY);
      }
    } catch { /* 무시 */ }
  }

  // ── 런 세이브 (슬롯) ──
  saveRun(s: RunSave, slot = 0) {
    localStorage.setItem(runKey(slot), JSON.stringify({ ...s, version: VERSION, slot }));
  }

  loadRun(slot = 0): RunSave | null {
    try {
      const raw = localStorage.getItem(runKey(slot));
      if (!raw) return null;
      const s = JSON.parse(raw) as RunSave;
      if (s.version !== VERSION) { this.clearRun(slot); return null; }
      s.slot = slot;
      return s;
    } catch { return null; }
  }

  clearRun(slot = 0) { localStorage.removeItem(runKey(slot)); }

  hasSave(slot = 0): boolean { return !!localStorage.getItem(runKey(slot)); }

  // 저장된 모든 슬롯 (slot 오름차순)
  listRuns(): RunSave[] {
    const out: RunSave[] = [];
    for (let i = 0; i < SAVE_SLOTS; i++) { const s = this.loadRun(i); if (s) out.push(s); }
    return out;
  }
  hasAnySave(): boolean { return this.listRuns().length > 0; }
  // 비어 있는 첫 슬롯 (없으면 마지막 슬롯 — 덮어쓰기)
  firstEmptySlot(): number {
    for (let i = 0; i < SAVE_SLOTS; i++) if (!this.hasSave(i)) return i;
    return SAVE_SLOTS - 1;
  }

  // ── 메타 세이브 ──
  saveMeta(m: MetaSave) {
    localStorage.setItem(META_KEY, JSON.stringify({ ...m, version: VERSION }));
  }

  loadMeta(): MetaSave {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return this.emptyMeta();
      const m = JSON.parse(raw) as MetaSave;
      if (m.version !== VERSION) return this.emptyMeta();
      // 구버전 호환: 누락 필드 보정
      if (!Array.isArray(m.unlockedStages)) m.unlockedStages = ["hero"];
      if (!Array.isArray(m.clearedStages)) m.clearedStages = [];
      return m;
    } catch { return this.emptyMeta(); }
  }

  emptyMeta(): MetaSave {
    return { version: VERSION, points: 0, ranks: {}, unlockedStages: ["hero"], clearedStages: [] };
  }

  // 포인트 추가 + 자동 저장
  addPoints(n: number): MetaSave {
    const m = this.loadMeta();
    m.points = Math.max(0, m.points + n);
    this.saveMeta(m);
    return m;
  }

  // 업그레이드 구매
  buyUpgrade(upgradeId: string, cost: number, maxRank: number): MetaSave | null {
    const m = this.loadMeta();
    const rank = m.ranks[upgradeId] ?? 0;
    if (rank >= maxRank) return null;
    if (m.points < cost) return null;
    m.points -= cost;
    m.ranks[upgradeId] = rank + 1;
    this.saveMeta(m);
    return m;
  }

  unlockStage(id: string): void {
    const m = this.loadMeta();
    if (!m.unlockedStages.includes(id)) {
      m.unlockedStages.push(id);
      this.saveMeta(m);
    }
  }

  // 포인트를 차감하고 스테이지를 해금. 포인트 부족/이미 해금 시 null.
  tryUnlock(id: string, cost: number): MetaSave | null {
    const m = this.loadMeta();
    if (m.unlockedStages.includes(id)) return null;
    if (m.points < cost) return null;
    m.points -= cost;
    m.unlockedStages.push(id);
    this.saveMeta(m);
    return m;
  }

  // 스테이지 클리어 기록 (영구). 신규 기록이면 true.
  markCleared(id: string): boolean {
    const m = this.loadMeta();
    if (m.clearedStages.includes(id)) return false;
    m.clearedStages.push(id);
    this.saveMeta(m);
    return true;
  }
}
