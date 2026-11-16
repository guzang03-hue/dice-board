import type { CsvRow } from "./csv";

// 데이터 소스 추상화. CSV, XLSX, Google Sheets 등 후속 구현 모두 이 인터페이스를 따른다.
// 각 이름(name)은 논리적 테이블 식별자다 (예: "tiles", "events").
export interface DataSource {
  load(name: string): Promise<CsvRow[]>;
  loadAll(names: string[]): Promise<Record<string, CsvRow[]>>;
}
