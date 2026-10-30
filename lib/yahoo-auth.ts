/**
 * Yahoo Finance 的 crumb 授权：先访问 https://fc.yahoo.com 拿 A3 Cookie，
 * 再用它换 crumb。`quoteSummary` 与 `v7/finance/quote` 都需要它。
 * 结果在进程内缓存 30 分钟；被子类模块共用（基本面 / 盘前盘后报价）。
 */

const HOSTS = ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"];
const CRUMB_TTL_MS = 30 * 60 * 1000;

export const YAHOO_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

export interface YahooAuth {
  cookie: string;
  crumb: string;
}

let authCache: (YahooAuth & { expiresAt: number }) | null = null;
let authInflight: Promise<YahooAuth> | null = null;

export function yahooHosts(): string[] {
  return HOSTS;
}

async function fetchYahooAuth(): Promise<YahooAuth> {
  const cookieResponse = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_BROWSER_HEADERS["User-Agent"], Accept: "*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  const setCookie =
    typeof cookieResponse.headers.getSetCookie === "function"
      ? cookieResponse.headers.getSetCookie().join("; ")
      : cookieResponse.headers.get("set-cookie") ?? "";
  const match = /A3=([^;]+)/.exec(setCookie);
  if (!match) throw new Error("Yahoo 没有下发授权 Cookie");

  const cookie = `A3=${match[1]}`;
  const crumbResponse = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YAHOO_BROWSER_HEADERS, Cookie: cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!crumbResponse.ok) throw new Error(`Yahoo crumb 获取失败（${crumbResponse.status}）`);

  const crumb = (await crumbResponse.text()).trim();
  if (!crumb || crumb.length > 32 || crumb.includes("<")) {
    throw new Error("Yahoo crumb 无效");
  }

  return { cookie, crumb };
}

export async function yahooAuth(): Promise<YahooAuth> {
  if (authCache && Date.now() < authCache.expiresAt) {
    return { cookie: authCache.cookie, crumb: authCache.crumb };
  }
  if (authInflight) return authInflight;

  authInflight = fetchYahooAuth()
    .then((auth) => {
      authCache = { ...auth, expiresAt: Date.now() + CRUMB_TTL_MS };
      return auth;
    })
    .finally(() => {
      authInflight = null;
    });

  return authInflight;
}

/** 授权失效（401/403）时清掉缓存，下次重新握手 */
export function resetYahooAuth() {
  authCache = null;
}
