import { assetUrl } from "./assetUrl";
// 문자열 해소 seam (다국어 토대).
//
// 게임의 모든 사용자 텍스트는 이 함수를 통과한다. 언어팩이 없으면(기본) 인라인으로
// 넘긴 기본 언어 문자열을 그대로 돌려준다 — 오버헤드 0, 작성 방식 불변.
// 2번째 언어를 붙일 때 setStrings()로 언어팩을 올리면, 키가 일치하는 텍스트만 번역으로 대체된다.
//
// 키 규칙 (구분자는 밑줄 '_'):
//   데이터 텍스트 : <테이블>_<ID>_<칼럼>      예) events_100023_title, resources_hp_label
//   UI 텍스트     : UI_<...>                  예) UI_menu_new, UI_popup_ok  (테이블명 자리에 UI)
//
// 자세한 배경은 docs/DATA-REDESIGN.md 부록 A 참조.

let strings: Record<string, string> = {};

/** 언어팩을 올린다(나중에 번역 파이프라인이 호출). 빈 맵이면 전부 기본 언어로 동작. */
export function setStrings(map: Record<string, string> | null | undefined): void {
  strings = map ?? {};
}

/** 현재 올라온 번역 키 수(디버그·검증용). */
export function loadedStringCount(): number {
  return Object.keys(strings).length;
}

/** 핵심 해소: key의 번역이 있으면 그것을, 없으면 fallback(인라인 기본 언어)을 돌려준다. */
export function t(key: string, fallback: string): string {
  const v = strings[key];
  return v != null && v !== "" ? v : fallback;
}

/** 데이터 행 텍스트 키: <테이블>_<ID>_<칼럼>. */
export function dataKey(table: string, id: string | number, column: string): string {
  return `${table}_${id}_${column}`;
}

/** UI 텍스트 키: UI_<...> (테이블명 자리에 UI). */
export function uiKey(...parts: (string | number)[]): string {
  return ["UI", ...parts].join("_");
}

/** 데이터 텍스트 해소 단축: t(dataKey(...), fallback). */
export function td(table: string, id: string | number, column: string, fallback: string | undefined | null): string {
  return t(dataKey(table, id, column), fallback ?? "");
}

/** UI 텍스트 해소 단축: t(UI_<id>, fallback). id는 'menu_new'처럼 밑줄로 구획. */
export function tu(id: string, fallback: string): string {
  return t(`UI_${id}`, fallback);
}

/** 선택: 언어팩 JSON을 fetch해 올린다(없으면 조용히 무시). 번역 파이프라인 단계에서 사용. */
export async function loadLanguage(lang: string, base = "/resources/data/"): Promise<boolean> {
  try {
    const res = await fetch(`${assetUrl(base)}strings_${lang}.json`);
    if (!res.ok) return false;
    setStrings(await res.json());
    return true;
  } catch {
    return false;
  }
}
