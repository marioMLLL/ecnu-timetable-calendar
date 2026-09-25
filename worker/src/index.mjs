const MAX_ICS_BYTES = 512 * 1024;
const MIN_TOKEN_BYTES = 16;
const MAX_LIFETIME_SECONDS = 400 * 24 * 60 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }, extraHeaders)
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const isBrowserExtension = /^chrome-extension:\/\/[a-p]{32}$/i.test(origin || "")
    || /^moz-extension:\/\/[0-9a-f-]{36}$/i.test(origin || "");
  if (!isBrowserExtension) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function base64UrlByteLength(token) {
  if (!/^[A-Za-z0-9_-]+$/.test(token || "")) return 0;
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - normalized.length % 4) % 4);
    return Uint8Array.from(atob(normalized + padding), (char) => char.charCodeAt(0)).length;
  } catch (_error) {
    return 0;
  }
}

function assertToken(token) {
  if (base64UrlByteLength(token) < MIN_TOKEN_BYTES) throw new Error("令牌长度不足");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let result = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) result |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return result === 0;
}

function validateIcs(value) {
  const ics = String(value || "");
  if (new TextEncoder().encode(ics).length > MAX_ICS_BYTES) throw new Error("日历文件过大");
  if (!/^BEGIN:VCALENDAR\r?\n/.test(ics) || !/\r?\nEND:VCALENDAR\r?\n?$/.test(ics)) {
    throw new Error("日历文件格式无效");
  }
  return ics;
}

function validateExpiration(value, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiresAt = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(expiresAt) || expiresAt < nowSeconds + 3600) throw new Error("自动删除时间至少需在 1 小时后");
  if (expiresAt > nowSeconds + MAX_LIFETIME_SECONDS) throw new Error("自动删除时间不能超过 400 天");
  return expiresAt;
}

async function readBody(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_ICS_BYTES * 1.2) throw new Error("请求内容过大");
  return request.json();
}

async function feedKey(readToken) {
  assertToken(readToken);
  return `feed:${await sha256(readToken)}`;
}

async function authenticate(request, record) {
  const match = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  assertToken(match[1]);
  return timingSafeEqual(await sha256(match[1]), record.updateTokenHash);
}

function publicBaseUrl(request, env) {
  return String(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

async function createFeed(request, env) {
  const body = await readBody(request);
  assertToken(body.readToken);
  assertToken(body.updateToken);
  if (body.readToken === body.updateToken) throw new Error("读取与更新令牌必须不同");
  const ics = validateIcs(body.ics);
  const expiration = validateExpiration(body.expiresAt);
  const key = await feedKey(body.readToken);
  if (await env.CALENDAR_FEEDS.get(key)) return json({ error: "订阅令牌已存在" }, 409, corsHeaders(request));
  const updatedAt = new Date().toISOString();
  const record = {
    ics,
    updateTokenHash: await sha256(body.updateToken),
    contentHash: await sha256(ics),
    expiresAt: expiration,
    updatedAt
  };
  await env.CALENDAR_FEEDS.put(key, JSON.stringify(record), { expiration });
  return json({
    readUrl: `${publicBaseUrl(request, env)}/v1/feeds/${body.readToken}.ics`,
    expiresAt: new Date(expiration * 1000).toISOString(),
    updatedAt
  }, 201, corsHeaders(request));
}

async function getFeed(request, env, readToken) {
  const key = await feedKey(readToken);
  const record = await env.CALENDAR_FEEDS.get(key, "json");
  if (!record) return json({ error: "订阅不存在或已过期" }, 404);
  return new Response(record.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=ecnu-timetable.ics",
      "Cache-Control": "no-cache, max-age=0",
      "ETag": `"${record.contentHash}"`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

async function mutateFeed(request, env, readToken) {
  const key = await feedKey(readToken);
  const record = await env.CALENDAR_FEEDS.get(key, "json");
  if (!record) return json({ error: "订阅不存在或已过期" }, 404, corsHeaders(request));
  if (!await authenticate(request, record)) return json({ error: "更新令牌无效" }, 401, corsHeaders(request));

  if (request.method === "DELETE") {
    await env.CALENDAR_FEEDS.delete(key);
    return json({ deleted: true }, 200, corsHeaders(request));
  }

  const body = await readBody(request);
  record.ics = validateIcs(body.ics);
  record.contentHash = await sha256(record.ics);
  record.updatedAt = new Date().toISOString();
  await env.CALENDAR_FEEDS.put(key, JSON.stringify(record), { expiration: record.expiresAt });
  return json({ updatedAt: record.updatedAt, expiresAt: new Date(record.expiresAt * 1000).toISOString() }, 200, corsHeaders(request));
}

export async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
    if (request.method === "POST" && url.pathname === "/v1/feeds") return createFeed(request, env);
    const match = url.pathname.match(/^\/v1\/feeds\/([A-Za-z0-9_-]+)(\.ics)?$/);
    if (match && request.method === "GET" && match[2]) return getFeed(request, env, match[1]);
    if (match && !match[2] && (request.method === "PUT" || request.method === "DELETE")) {
      return mutateFeed(request, env, match[1]);
    }
    return json({ error: "Not found" }, 404, corsHeaders(request));
  } catch (error) {
    return json({ error: error?.message || "请求无效" }, 400, corsHeaders(request));
  }
}

export default { fetch: handleRequest };
