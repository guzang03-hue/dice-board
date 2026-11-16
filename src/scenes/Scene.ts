// 모든 씬이 구현하는 인터페이스.
export interface Scene {
  readonly id: string;
  enter(data?: unknown): Promise<void>;
  exit(): Promise<void>;
  destroy?(): void;
}
