import { assetUrl } from "../core/assetUrl";
import type { DataSource } from "./DataSource";
import { parseCsv, type CsvRow } from "./csv";

// 로컬 CSV 파일을 fetch로 읽는 구현체.
// baseUrl 기준으로 `<name>.csv`를 가져온다.
export class CsvSource implements DataSource {
  constructor(private readonly baseUrl: string = "/resources/data/") {}

  async load(name: string): Promise<CsvRow[]> {
    // 캐시 방지(Cache-Busting) 파라미터 추가
    const url = assetUrl(this.baseUrl) + name + ".csv?t=" + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CSV load failed: ${url} (${res.status})`);
    const text = await res.text();
    return parseCsv(text);
  }

  async loadAll(names: string[]): Promise<Record<string, CsvRow[]>> {
    const entries = await Promise.all(names.map(async n => [n, await this.load(n)] as const));
    return Object.fromEntries(entries);
  }
}
