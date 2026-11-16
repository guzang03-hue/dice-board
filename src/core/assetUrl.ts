// 배포 경로(base) 보정 헬퍼.
// 데이터/코드에는 "/resources/..." 절대경로를 그대로 쓰고, 실제 요청 직전에 이 함수로 감싼다.
// 로컬(base="/")에서는 아무것도 바뀌지 않고, GitHub Pages(base="/dice-board/")에서는
// "/resources/x.png" → "/dice-board/resources/x.png" 로 바뀐다. url("/resources/...") 안쪽도 처리.
const BASE: string = ((import.meta as any).env?.BASE_URL as string | undefined) ?? "/";

export function assetUrl<T extends string | undefined | null>(path: T): T {
  if (!path || BASE === "/") return path;
  return path.replace(/(^|url\(\s*["']?)\/resources\//g, `$1${BASE}resources/`) as T;
}
