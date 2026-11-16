import { assetUrl } from "./assetUrl";
// 단순 오디오 매니저. assets.csv의 kind=audio 항목을 id로 등록하고 재생.
// 브라우저 자동재생 정책상 첫 사용자 제스처(주사위 클릭) 이후 소리가 난다.

export class AudioManager {
  private sounds = new Map<string, string>();   // id → url
  private cache = new Map<string, HTMLAudioElement>();
  private bgm: HTMLAudioElement | null = null;
  private muted = false;
  private bgmVol = 0.3;   // ui/config의 bgm_volume·sfx_volume으로 덮어씀(0~1)
  private sfxVol = 0.6;
  private lastBgmId: string | null = null;
  private unlocked = false;

  constructor() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      // 만약 브라우저 정책으로 인해 차단되었던 BGM이 있다면 재생 시도
      if (this.lastBgmId && !this.bgm) {
        this.playBgm(this.lastBgmId);
      }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
  }

  register(id: string, url: string) { 
    url = assetUrl(url); this.sounds.set(id, url); 
    // 브라우저 캐시에 올리기 위해 미리 Audio 객체 생성 (네트워크 지연/디코딩 지연 방지)
    const a = new Audio(url);
    a.preload = "auto";
    this.cache.set(id, a);
  }

  setVolumes(bgm: number, sfx: number) {
    this.bgmVol = Math.max(0, Math.min(1, bgm));
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    if (this.bgm) this.bgm.volume = this.bgmVol;
  }

  play(id: string) {
    if (this.muted || this.sfxVol <= 0) return;
    const url = this.sounds.get(id);
    if (!url) return;
    // 짧은 효과음은 매번 새 인스턴스로 (연타 대비)
    try {
      const a = new Audio(url);
      a.volume = this.sfxVol;
      void a.play().catch(() => {});
    } catch { /* 무시 */ }
  }

  private lastBgmUrl: string | null = null;

  playBgm(id: string) {
    const url = this.sounds.get(id) ?? assetUrl(id);  // id 또는 직접 경로
    if (!url) return;
    
    // ID가 다르더라도 최종 URL이 같으면 끊기지 않고 계속 재생 (경로 vs ID 혼용 방지)
    if ((this.lastBgmId === id || this.lastBgmUrl === url) && this.bgm) {
      this.lastBgmId = id; // ID만 업데이트
      return;
    }
    
    this.lastBgmId = id;
    this.lastBgmUrl = url;
    if (!url) return;
    this.stopBgm();
    try {
      let a = this.cache.get(id) as HTMLAudioElement;
      if (!a) {
        a = new Audio(url);
        a.preload = "auto";
        this.cache.set(id, a);
      }
      a.loop = true; a.volume = this.bgmVol; a.muted = this.muted;
      a.currentTime = 0; // 처음부터 재생
      this.bgm = a;
      this.cache.set("__bgm", a);
      const p = a.play();
      if (p !== undefined) {
        p.catch(() => {
          // 브라우저의 Autoplay 정책에 의해 차단된 경우
          this.bgm = null; 
        });
      }
    } catch { /* 무시 */ }
  }

  stopBgm() { 
    this.lastBgmId = null;
    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.bgm) this.bgm.muted = this.muted;
    return this.muted;
  }

  isMuted() { return this.muted; }
}
