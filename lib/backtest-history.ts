/** 回测页「最近回测过的代码」本地列表 */

export const HISTORY_KEY = "data-insider:backtest-history:v1";
export const HISTORY_SIZE = 12;

/** 去重 + 移到最前 + 截断（非法代码直接忽略） */
export function pushHistory(list: string[], symbol: string, max = HISTORY_SIZE): string[] {
  const value = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,12}$/.test(value)) return list;
  return [value, ...list.filter((item) => item !== value)].slice(0, max);
}

export function sanitizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const output: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,12}$/.test(value)) continue;
    if (output.includes(value)) continue;
    output.push(value);
    if (output.length >= HISTORY_SIZE) break;
  }
  return output;
}
